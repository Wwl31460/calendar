package cn.rili.calendar;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLongArray;

/**
 * APK 下载器：纯 Java，不依赖 Android API，方便单独压测。
 *
 * 国内下载 GitHub Release 时，镜像常见三种毛病：
 *   1. 连上了但不给数据（进度条永远停在原地）；
 *   2. 单连接限速到几 KB/s；
 *   3. 返回 200 的半截文件。
 * 对策分别是：停滞检测（20 秒拿不到 20KB 就断开换源）、分块并发、完成后按字节数校验。
 */
public final class ApkDownloader {

    public interface Listener {
        void onProgress(long loaded, long total);
    }

    public static final class Result {
        public final boolean ok;
        public final String error;
        public final long size;

        Result(boolean ok, String error, long size) {
            this.ok = ok;
            this.error = error;
            this.size = size;
        }
    }

    private static final String UA = "CalendarApp-Android";
    private static final int CONNECT_TIMEOUT_MS = 12000;
    private static final int READ_TIMEOUT_MS = 12000;
    /** 单块目标大小：3.5MB 的包 → 4 块并发，镜像按连接限速时能快 2~4 倍 */
    private static final long CHUNK_SIZE = 900_000L;
    private static final int MAX_PARTS = 4;
    /** 20 秒内拿不到这么多字节，就当这个源卡死了 */
    private static final long STALL_WINDOW_MS = 12000L;
    private static final long STALL_MIN_BYTES = 20480L;

    private ApkDownloader() {
    }

    /**
     * 下载到 target（会被覆盖）。
     * 拿到总大小时走分块并发；拿不到或源不支持 Range 时退回单连接。
     */
    public static Result download(List<String> urls, File target, long expectSize, Listener listener) {
        if (urls == null || urls.isEmpty()) return new Result(false, "缺少下载地址", 0);
        if (target.exists()) target.delete();

        long total = expectSize > 0 ? expectSize : probeTotal(urls);

        // 多个源时先比一下速度：把「能连上但只有几 KB/s」的源排到后面，
        // 否则会一直用最慢的那个源慢慢爬（用户看到的就是进度几乎不动）。
        List<String> ordered = urls.size() > 1 ? rankBySpeed(urls) : urls;

        String partFailure = null;
        if (total > CHUNK_SIZE) {
            int parts = (int) Math.min(MAX_PARTS, (total + CHUNK_SIZE - 1) / CHUNK_SIZE);
            String[] err = new String[1];
            if (downloadParts(ordered, target, total, parts, listener, err)) {
                return new Result(true, null, total);
            }
            if (target.exists()) target.delete();
            partFailure = err[0];
        }

        String[] lastError = new String[]{"网络异常，请稍后重试"};
        for (int i = 0; i < ordered.size(); i++) {
            if (fetchWhole(ordered.get(i), target, total, listener, lastError)) {
                return new Result(true, null, target.length());
            }
            if (target.exists()) target.delete();
        }
        if (partFailure != null && !partFailure.isEmpty()) {
            return new Result(false, "网络不稳定（" + partFailure + "）：" + urls.size() + " 个下载源都没下完，建议改用浏览器下载", 0);
        }
        return new Result(false, lastError[0], 0);
    }

    /**
     * 按速度给源排序：每个源拉 48KB 计时。
     * 连不上 / 超时 / 几乎没数据的源排到最后。
     */
    private static List<String> rankBySpeed(List<String> urls) {
        final int n = urls.size();
        final long[] cost = new long[n];
        Thread[] ts = new Thread[n];
        for (int i = 0; i < n; i++) {
            final int idx = i;
            ts[i] = new Thread(new Runnable() {
                @Override
                public void run() {
                    cost[idx] = probeSpeed(urls.get(idx));
                }
            });
            ts[i].setDaemon(true);
            ts[i].start();
        }
        for (Thread t : ts) {
            try {
                t.join();
            } catch (InterruptedException ignored) {
            }
        }

        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < n; i++) order.add(i);
        // 不用 List.sort（Android 24 才有的 Java 8 API）
        java.util.Collections.sort(order, new java.util.Comparator<Integer>() {
            @Override
            public int compare(Integer a, Integer b) {
                return Long.compare(cost[a], cost[b]);
            }
        });

        List<String> out = new ArrayList<>();
        for (int i : order) out.add(urls.get(i));
        return out;
    }

    /** 拉 48KB 记时间，返回毫秒；失败返回一个很大的数 */
    private static long probeSpeed(String url) {
        HttpURLConnection conn = null;
        InputStream in = null;
        long t0 = System.currentTimeMillis();
        long fake = Long.MAX_VALUE;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Range", "bytes=0-49151");
            int code = conn.getResponseCode();
            if (code != 200 && code != 206) return fake;
            in = conn.getInputStream();
            byte[] b = new byte[8192];
            long got = 0;
            while (got < 49152) {
                int r = in.read(b);
                if (r <= 0) break;
                got += r;
            }
            if (got < 8192) return fake - 1;
            return Math.max(1, System.currentTimeMillis() - t0);
        } catch (Exception e) {
            return fake;
        } finally {
            closeQuietly(in);
            if (conn != null) conn.disconnect();
        }
    }

    /* ---------------- 内部实现 ---------------- */

    /** 用 Range: bytes=0-0 的 Content-Range 拿到文件总大小 */
    static long probeTotal(List<String> urls) {
        for (String url : urls) {
            HttpURLConnection conn = null;
            try {
                conn = open(url);
                conn.setRequestProperty("Range", "bytes=0-0");
                int code = conn.getResponseCode();
                if (code != 200 && code != 206) continue;
                long fromRange = parseTotal(conn.getHeaderField("Content-Range"));
                if (fromRange > 0) return fromRange;
                long len = parseLong(conn.getHeaderField("Content-Length"));
                if (len > 0) return len;
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return 0L;
    }

    /** "bytes 0-0/3520151" → 3520151 */
    static long parseTotal(String contentRange) {
        if (contentRange == null) return 0;
        int slash = contentRange.lastIndexOf('/');
        if (slash < 0) return 0;
        return parseLong(contentRange.substring(slash + 1).trim());
    }

    private static long parseLong(String s) {
        if (s == null) return 0;
        try {
            return Long.parseLong(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", UA);
        return conn;
    }

    private static boolean isHtml(HttpURLConnection conn) {
        String ctype = conn.getContentType();
        if (ctype == null) return false;
        String low = ctype.toLowerCase();
        return low.contains("text/html") || low.contains("application/json");
    }

    /** 分块并发下载；任意一块没下完就返回 false */
    private static boolean downloadParts(List<String> urls, File target, long total, int parts,
                                         Listener listener, String[] errOut) {
        final AtomicLongArray done = new AtomicLongArray(parts);
        final AtomicInteger lastPct = new AtomicInteger(-1);
        final String[] partErr = new String[parts];
        final boolean[] okFlags = new boolean[parts];

        try {
            RandomAccessFile raf = new RandomAccessFile(target, "rw");
            raf.setLength(total);
            raf.close();
        } catch (Exception e) {
            errOut[0] = "无法写入缓存文件";
            return false;
        }

        Thread[] ts = new Thread[parts];
        for (int i = 0; i < parts; i++) {
            final int idx = i;
            final long start = total * i / parts;
            final long end = total * (i + 1) / parts - 1;
            ts[i] = new Thread(new Runnable() {
                @Override
                public void run() {
                    okFlags[idx] = fetchRange(urls, target, start, end, total, done, idx, lastPct, listener, partErr);
                }
            });
            ts[i].setDaemon(true);
            ts[i].start();
        }
        for (Thread t : ts) {
            try {
                t.join();
            } catch (InterruptedException ignored) {
            }
        }

        for (int i = 0; i < parts; i++) {
            if (!okFlags[i]) {
                errOut[0] = partErr[i] != null ? partErr[i] : "下载中断";
                return false;
            }
        }
        if (target.length() != total) {
            errOut[0] = "下载不完整（" + target.length() + "/" + total + " 字节）";
            return false;
        }
        return true;
    }

    /**
     * 下载 [start, end] 这一段：失败 / 过慢就换下一个源，并从本段已写入的位置续传。
     */
    private static boolean fetchRange(List<String> urls, File target, long start, long end, long total,
                                      AtomicLongArray done, int idx, AtomicInteger lastPct,
                                      Listener listener, String[] partErr) {
        final long span = end - start + 1;
        final int tries = Math.max(3, urls.size() * 3);
        int urlIdx = 0;

        for (int t = 0; t < tries; t++) {
            long pos = start + done.get(idx);
            if (pos > end) return true;
            String url = urls.get(urlIdx % urls.size());
            urlIdx++;

            HttpURLConnection conn = null;
            InputStream in = null;
            RandomAccessFile out = null;
            try {
                conn = open(url);
                conn.setRequestProperty("Range", "bytes=" + pos + "-" + end);
                int code = conn.getResponseCode();
                if (code == 416) {                 // 续传位置不被接受，本段重来
                    done.set(idx, 0);
                    continue;
                }
                if (code != 200 && code != 206) {
                    partErr[idx] = "下载失败（HTTP " + code + "）";
                    continue;
                }
                // 源忽略了 Range 返回整包：不能当分块用
                if (code == 200 && (pos != start || span < total)) {
                    partErr[idx] = "下载源不支持分块，正在换源";
                    continue;
                }
                if (isHtml(conn)) {
                    partErr[idx] = "下载源返回的是网页，已自动换源";
                    continue;
                }

                in = conn.getInputStream();
                out = new RandomAccessFile(target, "rw");
                out.seek(pos);
                byte[] buf = new byte[16384];
                long windowStart = System.currentTimeMillis();
                long windowBytes = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    long left = end - pos + 1;
                    if (left <= 0) break;
                    int give = (int) Math.min(n, left);
                    out.write(buf, 0, give);
                    pos += give;
                    done.set(idx, pos - start);
                    windowBytes += give;

                    report(done, total, lastPct, listener);

                    long now = System.currentTimeMillis();
                    if (now - windowStart > STALL_WINDOW_MS) {
                        if (windowBytes < STALL_MIN_BYTES) {
                            throw new IOException("下载过慢，正在换源");
                        }
                        windowStart = now;
                        windowBytes = 0;
                    }
                }
            } catch (Exception e) {
                String msg = e.getMessage();
                partErr[idx] = (msg == null || msg.isEmpty()) ? "网络中断，正在重试" : msg;
            } finally {
                closeQuietly(in);
                closeQuietly(out);
                if (conn != null) conn.disconnect();
            }
        }
        return start + done.get(idx) > end;
    }

    private static void report(AtomicLongArray done, long total, AtomicInteger lastPct, Listener l) {
        if (l == null || total <= 0) return;
        long sum = sumDone(done);
        int pct = (int) (sum * 100 / total);
        if (pct != lastPct.get()) {
            lastPct.set(pct);
            l.onProgress(sum, total);
        }
    }

    private static long sumDone(AtomicLongArray a) {
        long s = 0;
        for (int i = 0; i < a.length(); i++) s += a.get(i);
        return s;
    }

    /** 单连接整份下载（支持断点续传），分块走不通时兜底 */
    private static boolean fetchWhole(String url, File target, long expectSize, Listener listener, String[] lastError) {
        for (int attempt = 0; attempt < 4; attempt++) {
            long have = target.exists() ? target.length() : 0L;
            if (expectSize > 0 && have > expectSize) {
                target.delete();
                have = 0L;
            }
            if (expectSize > 0 && have == expectSize) break;

            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                conn = open(url);
                if (have > 0) conn.setRequestProperty("Range", "bytes=" + have + "-");
                int code = conn.getResponseCode();
                if (code == 416) {
                    target.delete();
                    continue;
                }
                if (code != 200 && code != 206) {
                    lastError[0] = "下载失败（HTTP " + code + "）";
                    return false;
                }
                if (isHtml(conn)) {
                    lastError[0] = "下载源返回的是网页，已自动换源";
                    return false;
                }

                boolean append = (code == 206 && have > 0);
                if (code == 200 && have > 0) have = 0L;

                long len = parseLong(conn.getHeaderField("Content-Length"));
                if (len > 0 && expectSize > 0 && have + len != expectSize) {
                    target.delete();
                    lastError[0] = "下载源返回的文件不完整，已自动换源";
                    return false;
                }

                in = conn.getInputStream();
                out = new FileOutputStream(target, append);

                byte[] buf = new byte[16384];
                long done = 0;
                int n;
                int lastPct = -1;
                long base = have;
                long whole = expectSize > 0 ? expectSize : (len > 0 ? base + len : 0);
                long windowStart = System.currentTimeMillis();
                long windowBytes = 0;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    windowBytes += n;
                    if (whole > 0) {
                        int pct = (int) ((base + done) * 100 / whole);
                        if (pct != lastPct) {
                            lastPct = pct;
                            if (listener != null) listener.onProgress(base + done, whole);
                        }
                    }
                    long now = System.currentTimeMillis();
                    if (now - windowStart > STALL_WINDOW_MS) {
                        if (windowBytes < STALL_MIN_BYTES) throw new IOException("下载过慢，正在换源");
                        windowStart = now;
                        windowBytes = 0;
                    }
                }
                out.flush();
                out.close();
                out = null;
                in.close();
                in = null;

                if (expectSize > 0 && target.length() < expectSize) continue;
                if (expectSize == 0 && len > 0 && done < len) continue;
                break;
            } catch (Exception e) {
                String msg = e.getMessage();
                lastError[0] = (msg == null || msg.isEmpty()) ? "网络中断，正在重试" : msg;
            } finally {
                closeQuietly(in);
                try {
                    if (out != null) out.close();
                } catch (Exception ignored) {
                }
                if (conn != null) conn.disconnect();
            }
        }

        if (!target.exists() || target.length() < 32768) {
            lastError[0] = "安装包没有下载完整";
            return false;
        }
        if (expectSize > 0 && target.length() != expectSize) {
            lastError[0] = "下载不完整（" + target.length() + "/" + expectSize + " 字节）";
            return false;
        }
        if (listener != null) listener.onProgress(target.length(), target.length());
        return true;
    }

    private static void closeQuietly(InputStream in) {
        try {
            if (in != null) in.close();
        } catch (Exception ignored) {
        }
    }

    private static void closeQuietly(RandomAccessFile f) {
        try {
            if (f != null) f.close();
        } catch (Exception ignored) {
        }
    }
}
