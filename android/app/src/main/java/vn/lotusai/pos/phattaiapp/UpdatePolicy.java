package vn.lotusai.pos.phattaiapp;

/** Pure policy shared by the Android downloader and host-side regression tests. */
public final class UpdatePolicy {
    public static final long MAX_APK_BYTES = 25L * 1024 * 1024;
    private UpdatePolicy() {}

    public static final class Installed {
        public final String applicationId, signerSha256;
        public final long versionCode;
        public Installed(String id, String signer, long code) {
            applicationId = id; signerSha256 = signer; versionCode = code;
        }
    }
    public static final class Release {
        public final String applicationId, signerSha256, versionName, sha256, path;
        public final long versionCode, sizeBytes;
        public final int minSdk;
        public Release(String id, String signer, String name, long code, String hash,
                       long size, int sdk, String urlPath) {
            applicationId = id; signerSha256 = signer; versionName = name; versionCode = code;
            sha256 = hash; sizeBytes = size; minSdk = sdk; path = urlPath;
        }
    }
    public static boolean digest(String value) {
        return value != null && value.matches("[a-f0-9]{64}");
    }
    public static void requireRelease(Installed installed, Release release, int sdk) {
        if (installed == null || release == null || installed.applicationId == null ||
            !installed.applicationId.equals(release.applicationId)) throw new SecurityException("Sai ứng dụng / 应用不匹配");
        if (!digest(installed.signerSha256) || !installed.signerSha256.equals(release.signerSha256))
            throw new SecurityException("Sai khóa ký / 签名不匹配");
        if (installed.versionCode < 1 || release.versionCode <= installed.versionCode ||
            release.versionCode > 2147483647L || release.versionName == null ||
            !release.versionName.matches("[0-9]+\\.[0-9]+\\.[0-9]+"))
            throw new SecurityException("Phiên bản không mới hơn / 版本并非更新");
        if (!digest(release.sha256) || release.sizeBytes < 1 || release.sizeBytes > MAX_APK_BYTES)
            throw new SecurityException("Thông tin APK không hợp lệ / APK 资料无效");
        if (release.minSdk < 23 || release.minSdk > sdk) throw new SecurityException("Android không tương thích / Android 不兼容");
        String path = "/releases/android/" + installed.applicationId + "/v" + release.versionCode + "/" + release.sha256 + ".apk";
        if (!path.equals(release.path)) throw new SecurityException("Đường tải không hợp lệ / 下载路径无效");
    }
    public static void requireDownloaded(Installed installed, Release release, int sdk,
                                         long size, String hash, Installed archive, String versionName) {
        requireRelease(installed, release, sdk);
        if (size != release.sizeBytes || !release.sha256.equals(hash))
            throw new SecurityException("APK tải thiếu hoặc sai checksum / APK 下载不完整或校验失败");
        if (archive == null || !release.applicationId.equals(archive.applicationId) ||
            !release.signerSha256.equals(archive.signerSha256) || release.versionCode != archive.versionCode ||
            !release.versionName.equals(versionName))
            throw new SecurityException("APK không khớp bản phát hành / APK 与发布资料不匹配");
    }
}
