import cn.rili.calendar.ApkDownloader;

import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/** 用真实的 GitHub 镜像跑一遍 ApkDownloader（模拟手机上的更新下载） */
public class RealTest {

    public static void main(String[] args) throws Exception {
        String gh = "https://github.com/Wwl31460/calendar/releases/download/v1.2.1/calendar-v1.2.1.apk";
        long expect = 3524772L;
        String wantSha = "1ee48e9401cd748de00c13024cf1caddcc0e789d6115fbb84a0e63fc41df30f0";

        List<String> urls = new ArrayList<>();
        urls.add("https://ghfast.top/" + gh);
        urls.add("https://gh-proxy.org/" + gh);
        urls.add("https://gh-proxy.com/" + gh);
        urls.add("https://ghproxy.net/" + gh);
        urls.add(gh);

        if (args.length > 0 && args[0].equals("single")) {
            // 只留最慢的那个源，看会不会卡住
            urls.clear();
            urls.add("https://ghproxy.net/" + gh);
        }

        File out = new File(System.getProperty("java.io.tmpdir"), "real-dl.apk");
        out.delete();

        long t0 = System.currentTimeMillis();
        long[] last = {0, 0};
        int[] ticks = {0};
        ApkDownloader.Result r = ApkDownloader.download(urls, out, expect, (loaded, total) -> {
            last[0] = loaded;
            last[1] = total;
            if (++ticks[0] % 20 == 0) {
                System.out.printf("  %5.1f%%  %d / %d%n", loaded * 100.0 / Math.max(1, total), loaded, total);
            }
        });
        long ms = System.currentTimeMillis() - t0;

        long size = out.exists() ? out.length() : 0;
        String sha = size > 0 ? sha256(Files.readAllBytes(out.toPath())) : "-";
        System.out.printf("%n结果: ok=%s 用时=%.1fs 大小=%d/%d sha一致=%s 错误=%s%n",
                r.ok, ms / 1000.0, size, expect, wantSha.equals(sha), r.error == null ? "-" : r.error);
        if (out.exists()) out.delete();
        System.exit(r.ok ? 0 : 1);
    }

    static String sha256(byte[] b) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
