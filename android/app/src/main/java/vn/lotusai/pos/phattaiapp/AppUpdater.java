package vn.lotusai.pos.phattaiapp;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Checks automatically; downloads and opens Android's installer only after an explicit action. */
public final class AppUpdater {
    public static final int INSTALL_REQUEST = 4613;
    public interface Listener {
        void onState(String json);
        void onInstallReady();
        /** The owner allowed installs and Android restarted the app: carry on with that update. */
        void onResumeInstall();
    }
    // Granting "install unknown apps" makes Android kill the app (REQUEST_INSTALL_PACKAGES changed),
    // so the update the owner started is remembered for a few minutes and resumed after the restart.
    private static final long RESUME_WINDOW_MS = 10 * 60 * 1000L;
    private final SharedPreferences prefs;
    private volatile boolean resumeInstall;
    private final Activity activity;
    private final Listener listener;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean closed, busy;
    private volatile HttpsURLConnection connection;
    private volatile String state = "IDLE", message = "Chưa kiểm tra / 尚未检查";
    private volatile int progress;
    private volatile UpdatePolicy.Release release;
    private volatile File readyFile;
    private volatile String checkedBase;
    private long lastCheck = -1;
    private boolean pendingPermission;

    public AppUpdater(Activity activity, Listener listener) {
        this.activity = activity; this.listener = listener;
        prefs = activity.getSharedPreferences("lotus_app_update", Activity.MODE_PRIVATE);
        long until = prefs.getLong("resume_until", 0);
        if (until != 0) {
            long now = System.currentTimeMillis();
            resumeInstall = until > now && until - now <= RESUME_WINDOW_MS && canInstallPackages();
            prefs.edit().remove("resume_until").apply();
        }
    }
    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls();
    }
    @SuppressWarnings("deprecation")
    private int certificateFlags() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }
    @SuppressWarnings("deprecation")
    private static long code(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }
    @SuppressWarnings("deprecation")
    private static String signer(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= 28) signatures = info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        else signatures = info.signatures;
        if (signatures == null || signatures.length != 1) throw new SecurityException("Không đọc được một khóa ký duy nhất / 无法读取唯一签名");
        return hex(MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray()));
    }
    private PackageInfo installedInfo() throws Exception {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), certificateFlags());
    }
    private UpdatePolicy.Installed installed() throws Exception {
        PackageInfo info = installedInfo();
        return new UpdatePolicy.Installed(info.packageName, signer(info), code(info));
    }
    public String appInfo() {
        try {
            PackageInfo info = installedInfo();
            return new JSONObject().put("native", true).put("applicationId", info.packageName)
                .put("version", info.versionName).put("versionCode", code(info)).put("signerSha256", signer(info))
                .put("sunmiSdk", "1.0.18").put("appUpdate", true).toString();
        } catch (Exception error) { return "{\"native\":true,\"appUpdate\":true}"; }
    }
    public String snapshot() {
        try {
            JSONObject value = new JSONObject(appInfo()).put("status", state).put("message", message)
                .put("busy", busy).put("progress", progress).put("available", release != null);
            UpdatePolicy.Release current = release;
            if (current != null) value.put("releaseVersion", current.versionName).put("releaseVersionCode", current.versionCode);
            return value.toString();
        } catch (Exception error) { return "{\"status\":\"ERROR\",\"message\":\"Không đọc được cập nhật / 无法读取更新\"}"; }
    }
    private void report(String next, String text) {
        state = next; message = text;
        String data = snapshot();
        main.post(() -> { if (!closed) listener.onState(data); });
    }
    private static String base(String raw) throws Exception {
        URI uri = new URI(raw);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null ||
            uri.getQuery() != null || uri.getFragment() != null ||
            !(uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath())))
            throw new SecurityException("Worker cập nhật phải dùng HTTPS / 更新服务必须使用 HTTPS");
        return uri.toASCIIString().replaceAll("/+$", "");
    }
    private HttpsURLConnection connect(String url) throws Exception {
        HttpsURLConnection result = (HttpsURLConnection) new java.net.URL(url).openConnection();
        result.setConnectTimeout(15000); result.setReadTimeout(20000);
        result.setInstanceFollowRedirects(false); result.setRequestProperty("Accept-Encoding", "identity");
        connection = result;
        if (closed) { result.disconnect(); throw new InterruptedException(); }
        return result;
    }
    private static long number(JSONObject object, String key) throws Exception {
        Object value = object.get(key);
        if (!(value instanceof Integer) && !(value instanceof Long)) throw new SecurityException("Invalid update number: " + key);
        return ((Number) value).longValue();
    }
    public synchronized void check(String rawBase, boolean force) {
        if (closed || busy || (!force && lastCheck >= 0 && SystemClock.elapsedRealtime() - lastCheck < 5 * 60 * 1000L)) return;
        busy = true; lastCheck = SystemClock.elapsedRealtime();
        report("CHECKING", "Đang kiểm tra bản cập nhật / 正在检查更新");
        executor.execute(() -> {
            HttpsURLConnection conn = null;
            try {
                String origin = base(rawBase);
                UpdatePolicy.Installed info = installed();
                String path = "/api/android/update?applicationId=" + URLEncoder.encode(info.applicationId, "UTF-8") +
                    "&signerSha256=" + info.signerSha256 + "&versionCode=" + info.versionCode + "&sdk=" + Build.VERSION.SDK_INT;
                conn = connect(origin + path);
                if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = conn.getInputStream()) {
                    byte[] buffer = new byte[4096]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (closed || bytes.size() + count > 65536) throw new Exception("Metadata too large or canceled");
                        bytes.write(buffer, 0, count);
                    }
                }
                JSONObject result = new JSONObject(bytes.toString("UTF-8"));
                if (!Boolean.TRUE.equals(result.opt("ok"))) throw new Exception("Update service rejected request");
                release = null; readyFile = null; checkedBase = origin;
                if (Boolean.TRUE.equals(result.opt("available"))) {
                    JSONObject data = result.getJSONObject("release");
                    if (!Boolean.TRUE.equals(data.opt("signatureVerified"))) throw new SecurityException("Unverified release");
                    long minSdk = number(data, "minSdk");
                    if (minSdk > 100 || minSdk < 23) throw new SecurityException("Invalid Android requirement");
                    UpdatePolicy.Release candidate = new UpdatePolicy.Release(data.getString("applicationId"), data.getString("signerSha256"),
                        data.getString("versionName"), number(data, "versionCode"), data.getString("sha256"),
                        number(data, "sizeBytes"), (int) minSdk, data.getString("path"));
                    UpdatePolicy.requireRelease(info, candidate, Build.VERSION.SDK_INT);
                    release = candidate;
                    report("AVAILABLE", "Có bản " + candidate.versionName + " / 有新版本 " + candidate.versionName);
                    if (resumeInstall) {
                        resumeInstall = false;
                        // Give the restarted page a moment to load before asking it whether it is idle.
                        main.postDelayed(() -> { if (!closed) listener.onResumeInstall(); }, 2500);
                    }
                } else {
                    resumeInstall = false;
                    String status = result.optString("status");
                    if ("UP_TO_DATE".equals(status)) report(status, "Đang dùng bản mới nhất đã phát hành / 已使用最新发布版本");
                    else if ("NOT_PUBLISHED".equals(status)) report(status, "Chưa có bản cập nhật được phát hành cho máy này / 此设备暂无已发布更新");
                    else if ("UNSUPPORTED_IDENTITY".equals(status)) report(status, "Bản cài trên máy chưa khớp kênh cập nhật; nhờ chủ tiệm kiểm tra / 当前安装版本不匹配更新渠道，请联系店主");
                    else if ("INCOMPATIBLE_ANDROID".equals(status)) report(status, "Android trên máy chưa phù hợp với bản cập nhật / 当前 Android 不兼容此更新");
                    else throw new Exception("Unknown update response");
                }
            } catch (Exception error) {
                release = null; readyFile = null;
                report("ERROR", "Chưa kiểm tra được; thử lại khi có mạng / 暂时无法检查，请联网后重试");
            } finally {
                if (conn != null) conn.disconnect(); connection = null; busy = false;
                if (!closed) report(state, message);
            }
        });
    }
    public synchronized void downloadAndInstall() {
        if (closed || busy) return;
        final UpdatePolicy.Release target = release;
        final String origin = checkedBase;
        if (target == null || origin == null) { report("ERROR", "Kiểm tra cập nhật trước / 请先检查更新"); return; }
        busy = true; progress = 0;
        report("DOWNLOADING", "Đang tải cập nhật / 正在下载更新");
        executor.execute(() -> {
            HttpsURLConnection conn = null; File partial = null; boolean installReady = false;
            try {
                UpdatePolicy.Installed current = installed();
                UpdatePolicy.requireRelease(current, target, Build.VERSION.SDK_INT);
                File directory = new File(activity.getCacheDir(), "verified-updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception("No update storage");
                // Only this executor writes the private update directory.
                File[] previous = directory.listFiles();
                if (previous != null) for (File file : previous) if (file.getName().matches("[a-f0-9]{64}\\.(apk|part\\.apk)")) file.delete();
                partial = new File(directory, target.sha256 + ".part.apk");
                File verified = new File(directory, target.sha256 + ".apk");
                conn = connect(base(origin) + target.path);
                if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
                String lengthHeader = conn.getHeaderField("Content-Length");
                long length = lengthHeader == null ? -1 : Long.parseLong(lengthHeader);
                if (length >= 0 && length != target.sizeBytes) throw new SecurityException("APK size mismatch");
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                long total = 0, notified = 0;
                try (InputStream input = conn.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (closed || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                        total += count;
                        if (total > target.sizeBytes || total > UpdatePolicy.MAX_APK_BYTES) throw new SecurityException("APK oversized");
                        hash.update(buffer, 0, count); output.write(buffer, 0, count);
                        progress = (int) (total * 100 / target.sizeBytes);
                        if (total - notified >= 1024 * 1024) { notified = total; report("DOWNLOADING", "Đang tải / 正在下载 " + progress + "%"); }
                    }
                    output.getFD().sync();
                }
                PackageInfo archive = activity.getPackageManager().getPackageArchiveInfo(partial.getAbsolutePath(), certificateFlags());
                UpdatePolicy.Installed apk = archive == null ? null : new UpdatePolicy.Installed(archive.packageName, signer(archive), code(archive));
                UpdatePolicy.requireDownloaded(current, target, Build.VERSION.SDK_INT, total, hex(hash.digest()), apk, archive == null ? null : archive.versionName);
                if (!partial.renameTo(verified)) throw new Exception("Cannot keep verified update");
                readyFile = verified; partial = null; progress = 100;
                report("READY", "Đã kiểm tra APK; sẵn sàng cài đặt / APK 已验证，可以安装");
                installReady = true;
            } catch (Exception error) {
                readyFile = null;
                report("ERROR", "Cập nhật chưa thành công; thử lại. Bản đang dùng vẫn giữ nguyên / 更新未完成，请重试，现有版本仍保留");
            } finally {
                if (partial != null) partial.delete();
                if (conn != null) conn.disconnect(); connection = null; busy = false;
                if (!closed) report(state, message);
            }
            if (installReady) main.post(() -> { if (!closed) listener.onInstallReady(); });
        });
    }
    /** Must be called on the UI thread after MainActivity rechecks drafts and print jobs. */
    public void openInstaller() {
        try {
            File apk = readyFile; UpdatePolicy.Release target = release;
            if (closed || busy || apk == null || target == null || !apk.isFile() || apk.length() != target.sizeBytes) return;
            if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                pendingPermission = true;
                prefs.edit().putLong("resume_until", System.currentTimeMillis() + RESUME_WINDOW_MS).commit();
                report("PERMISSION_REQUIRED", "Cho phép Lotus cài bản cập nhật, rồi quay lại / 请允许 Lotus 安装更新，然后返回");
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
                return;
            }
            Uri uri = Uri.parse("content://" + activity.getPackageName() + ".updates/apk/" + target.sha256 + ".apk");
            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE).setData(uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).putExtra(Intent.EXTRA_RETURN_RESULT, true);
            intent.setClipData(ClipData.newRawUri("Lotus POS update", uri));
            report("INSTALLER_OPEN", "Xác nhận cập nhật trong màn hình Android / 请在 Android 安装界面确认更新");
            activity.startActivityForResult(intent, INSTALL_REQUEST);
        } catch (Exception error) { report("ERROR", "Không mở được trình cài đặt; thử lại / 无法打开安装界面，请重试"); }
    }
    public void onResume() {
        if (!pendingPermission) return;
        pendingPermission = false;
        prefs.edit().remove("resume_until").apply();
        if (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()) listener.onInstallReady();
        else report("PERMISSION_REQUIRED", "Chưa cho phép cài cập nhật / 尚未允许安装更新");
    }
    public void installerReturned() {
        report("READY", "Nếu chưa cài, bấm cập nhật để thử lại / 如未安装，请再次点击更新");
    }
    public void close() {
        closed = true; HttpsURLConnection conn = connection;
        if (conn != null) conn.disconnect(); executor.shutdownNow(); main.removeCallbacksAndMessages(null);
    }
    private static String hex(byte[] bytes) {
        StringBuilder text = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) text.append(String.format(Locale.ROOT, "%02x", value & 255));
        return text.toString();
    }
}
