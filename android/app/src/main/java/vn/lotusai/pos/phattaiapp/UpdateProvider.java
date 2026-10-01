package vn.lotusai.pos.phattaiapp;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;

/** Grants the Android installer read access to one verified APK, never a directory. */
public final class UpdateProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private File file(Uri uri) throws FileNotFoundException {
        List<String> parts = uri.getPathSegments();
        if (!"content".equals(uri.getScheme()) ||
            !(getContext().getPackageName() + ".updates").equals(uri.getAuthority()) ||
            uri.getQuery() != null || uri.getFragment() != null || parts.size() != 2 ||
            !"apk".equals(parts.get(0)) || !parts.get(1).matches("[a-f0-9]{64}\\.apk"))
            throw new FileNotFoundException("Invalid update URI");
        File directory = new File(getContext().getCacheDir(), "verified-updates");
        File result = new File(directory, parts.get(1));
        try {
            if (!result.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile()) ||
                !result.isFile()) throw new FileNotFoundException("Verified APK missing");
        } catch (IOException error) { throw new FileNotFoundException("Verified APK missing"); }
        return result;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read-only update URI");
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        try {
            File apk = file(uri);
            String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = "LotusPOS-update.apk";
                if (OpenableColumns.SIZE.equals(columns[i])) values[i] = apk.length();
            }
            cursor.addRow(values); return cursor;
        } catch (FileNotFoundException error) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
