import cn.rili.calendar.ApkDownloader;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.Executors;

/**
 * 用 JDK 自带的 HTTP server 模拟三种「坏镜像」，验证 ApkDownloader 的自愈能力：
 *   /stall   —— 发 70KB 后彻底不出数据（就是用户遇到的「卡在 2%」）
 *   /slow    —— 支持 Range 但限速 8KB/s
 *   /noRange —— 忽略 Range，直接返回整份
 *   /good    —— 正常支持 Range
 */
public class DlTest {

    static byte[] DATA;
    static int port;
    static String sha;

    public static void main(String[] args) throws Exception {
        DATA = new byte[3_500_000];
        new Random(42).nextBytes(DATA);
        sha = sha256(DATA);

        HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.setExecutor(Executors.newFixedThreadPool(16));
        port = srv.getAddress().getPort();
        srv.createContext("/good", ex -> serve(ex, "good"));
        srv.createContext("/stall", ex -> serve(ex, "stall"));
        srv.createContext("/slow", ex -> serve(ex, "slow"));
        srv.createContext("/noRange", ex -> serve(ex, "noRange"));
        srv.start();
        System.out.println("测试服务器 127.0.0.1:" + port + "，文件 " + DATA.length + " 字节");

        run("A 首选源卡死，自动换源", new String[]{u("stall"), u("good")}, DATA.length);
        run("B 首选源超慢，自动换源", new String[]{u("slow"), u("good")}, DATA.length);
        run("C 源不支持 Range", new String[]{u("noRange")}, DATA.length);
        run("D 全部源卡死", new String[]{u("stall")}, DATA.length);
        run("E 未知大小（expectSize=0）", new String[]{u("good")}, 0);

        srv.stop(0);
        System.exit(0);
    }

    static String u(String kind) {
        return "http://127.0.0.1:" + port + "/" + kind;
    }

    static void run(String name, String[] urls, long expect) throws Exception {
        File out = File.createTempFile("dl-test", ".apk");
        out.delete();
        List<String> list = new ArrayList<>();
        for (String s : urls) list.add(s);

        long t0 = System.currentTimeMillis();
        final long[] last = {0, 0};
        ApkDownloader.Result r = ApkDownloader.download(list, out, expect, (loaded, total) -> {
            last[0] = loaded;
            last[1] = total;
        });
        long ms = System.currentTimeMillis() - t0;

        boolean hashOk = false;
        long size = out.exists() ? out.length() : 0;
        if (r.ok && size == DATA.length) {
            hashOk = sha.equals(sha256(Files.readAllBytes(out.toPath())));
        }
        System.out.printf("%-26s ok=%-5s 用时=%5.1fs 大小=%d/%d sha一致=%s 最后进度=%d/%d 错误=%s%n",
                name, r.ok, ms / 1000.0, size, DATA.length, hashOk, last[0], last[1],
                r.error == null ? "-" : r.error);
        if (out.exists()) out.delete();
    }

    static void serve(HttpExchange ex, String kind) {
        try {
            String range = ex.getRequestHeaders().getFirst("Range");
            Headers h = ex.getResponseHeaders();

            long start = 0, end = DATA.length - 1L;
            boolean partial = false;
            if (range != null && range.startsWith("bytes=") && !kind.equals("noRange")) {
                String spec = range.substring(6);
                int dash = spec.indexOf('-');
                String a = spec.substring(0, dash).trim();
                String b = spec.substring(dash + 1).trim();
                if (!a.isEmpty()) start = Long.parseLong(a);
                if (!b.isEmpty()) end = Long.parseLong(b);
                if (end >= DATA.length) end = DATA.length - 1L;
                partial = true;
            }
            if (end < start) {
                ex.sendResponseHeaders(416, -1);
                ex.close();
                return;
            }

            ex.getResponseHeaders().set("Content-Type", "application/vnd.android.package-archive");
            if (partial) {
                ex.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + DATA.length);
                ex.sendResponseHeaders(206, end - start + 1);
            } else {
                ex.getResponseHeaders().set("Accept-Ranges", "bytes");
                ex.sendResponseHeaders(200, DATA.length);
            }

            OutputStream os = ex.getResponseBody();
            long total = end - start + 1;

            if (kind.equals("stall")) {
                // 先给 70KB，然后彻底沉默（正是「卡在 2%」的样子）
                int head = (int) Math.min(70000, total);
                os.write(DATA, (int) start, head);
                os.flush();
                Thread.sleep(120000);
                os.close();
                return;
            }
            if (kind.equals("slow")) {
                int sent = 0;
                byte[] chunk = new byte[800];
                while (sent < total) {
                    int n = (int) Math.min(chunk.length, total - sent);
                    System.arraycopy(DATA, (int) (start + sent), chunk, 0, n);
                    os.write(chunk, 0, n);
                    os.flush();
                    sent += n;
                    Thread.sleep(100);
                }
                os.close();
                return;
            }
            os.write(DATA, (int) start, (int) total);
            os.close();
        } catch (Exception e) {
            try {
                ex.close();
            } catch (Exception ignored) {
            }
        }
    }

    static String sha256(byte[] b) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
