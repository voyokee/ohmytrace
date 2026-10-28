package com.ohmytrace.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.ImageDecoder;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

final class MediaLibrary {
    private final Context context;
    private final ContentResolver resolver;
    private final android.content.SharedPreferences preferences;
    // EXIF reads are I/O bound: a small pool keeps several originals in flight per page.
    private final ExecutorService exifPool = Executors.newFixedThreadPool(Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors())));
    MediaLibrary(Context context) {
        this.context = context; resolver = context.getContentResolver();
        preferences = context.getSharedPreferences("media-library", Context.MODE_PRIVATE);
        if (!preferences.contains("device")) preferences.edit().putString("device", UUID.randomUUID().toString()).apply();
    }
    boolean granted(String permission) { return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED; }
    String photos() {
        if (granted(Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE)) return "authorized";
        if (Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)) return "limited";
        return "denied";
    }
    String scope() { return preferences.getString("device", "") + ":" + preferences.getLong("epoch", 0) + ":" + photos() + ":" + granted(Manifest.permission.ACCESS_MEDIA_LOCATION); }
    void permissionChanged() { preferences.edit().putLong("epoch", preferences.getLong("epoch", 0) + 1).apply(); }
    JSONObject permissions() throws Exception {
        return new JSONObject().put("photos", photos()).put("location", granted(Manifest.permission.ACCESS_MEDIA_LOCATION) ? "authorized" : "permission-required").put("scopeId", scope());
    }
    private List<String> volumes() {
        List<String> volumes = new ArrayList<>(MediaStore.getExternalVolumeNames(context)); Collections.sort(volumes); return volumes;
    }
    private String version(String volume) { return Build.VERSION.SDK_INT >= 30 ? MediaStore.getVersion(context, volume) : MediaStore.getVersion(context); }
    private long generation(String volume) { return Build.VERSION.SDK_INT >= 30 ? MediaStore.getGeneration(context, volume) : System.currentTimeMillis() / 1000; }
    private String stamp(Cursor c) { return c.getLong(3) + ":" + c.getLong(4) + ":" + (Build.VERSION.SDK_INT >= 30 ? c.getLong(5) : 0); }
    private String[] projection() {
        return Build.VERSION.SDK_INT >= 30 ? new String[]{"_id", "_display_name", "mime_type", "_size", "date_modified", "generation_modified"}
                : new String[]{"_id", "_display_name", "mime_type", "_size", "date_modified"};
    }
    private JSONObject entry(Cursor c, String volume) throws Exception {
        JSONObject handle = new JSONObject().put("source", "android").put("localId", String.valueOf(c.getLong(0))).put("volume", volume).put("scopeId", scope()).put("stamp", stamp(c)).put("libraryVersion", version(volume));
        return new JSONObject().put("handle", handle).put("name", c.getString(1)).put("mimeType", c.getString(2)).put("size", c.getLong(3)).put("lastModified", c.getLong(4) * 1000).put("locationAuthorized", granted(Manifest.permission.ACCESS_MEDIA_LOCATION));
    }
    JSONObject enumerate(JSONObject options, CancellationSignal signal) throws Exception {
        if (photos().equals("denied")) throw new SecurityException("请先授权读取可访问的系统照片");
        ScanWindow.requireLocation(granted(Manifest.permission.ACCESS_MEDIA_LOCATION));
        Long start = options.isNull("startMs") ? null : options.getLong("startMs"), end = options.isNull("endMs") ? null : options.getLong("endMs");
        int count = options.optInt("pageSize", 100); ScanWindow.validate(start, end, count);
        String key = String.valueOf(start) + "/" + String.valueOf(end);
        JSONObject cursor = options.optJSONObject("cursor"), since = options.optJSONObject("since");
        List<String> volumes = volumes(); JSONObject snapshot;
        if (cursor == null) {
            JSONObject versions = new JSONObject(), upper = new JSONObject();
            for (String volume : volumes) { versions.put(volume, version(volume)); upper.put(volume, generation(volume)); }
            snapshot = new JSONObject().put("scopeId", scope()).put("versions", versions).put("upper", upper).put("volumes", new JSONArray(volumes)).put("key", key);
            cursor = new JSONObject().put("snapshot", snapshot).put("volumeIndex", 0).put("afterId", 0);
        } else {
            snapshot = cursor.getJSONObject("snapshot");
            if (!snapshot.getString("scopeId").equals(scope()) || !snapshot.getString("key").equals(key) || !snapshot.getJSONArray("volumes").toString().equals(new JSONArray(volumes).toString()))
                throw new SecurityException("相册授权范围已变化，请重新扫描；已有记忆会自动去重");
            for (String volume : volumes) if (!snapshot.getJSONObject("versions").getString(volume).equals(version(volume))) throw new IllegalStateException("相册索引已重建，请重新扫描");
        }
        JSONArray entries = new JSONArray(); int volumeIndex = cursor.getInt("volumeIndex"); long after = cursor.getLong("afterId");
        if (volumeIndex < 0 || volumeIndex > volumes.size() || after < 0) throw new IllegalArgumentException("扫描游标无效");
        while (volumeIndex < volumes.size() && entries.length() < count) {
            signal.throwIfCanceled(); String volume = volumes.get(volumeIndex);
            boolean incremental = Build.VERSION.SDK_INT >= 30 && since != null && ScanWindow.incremental(since.optString("scopeId"), scope(), since.optJSONObject("versions") == null ? "" : since.getJSONObject("versions").optString(volume), snapshot.getJSONObject("versions").getString(volume), photos().equals("limited"));
            String column = Build.VERSION.SDK_INT >= 30 ? "generation_modified" : "date_modified";
            long lower = incremental ? since.getJSONObject("upper").optLong(volume, 0) : -1, upper = snapshot.getJSONObject("upper").getLong(volume);
            if (lower > upper) lower = -1;
            String selection = "_id > ? AND " + column + (Build.VERSION.SDK_INT >= 30 ? " > ?" : " >= ?") + " AND " + column + " <= ?";
            ArrayList<String> args = new ArrayList<>(); Collections.addAll(args, String.valueOf(after), String.valueOf(lower), String.valueOf(upper));
            // DATE_ADDED is only an acquisition filter fallback, never capture evidence.
            String time = "(CASE WHEN datetaken > 0 THEN datetaken ELSE date_added * 1000 END)";
            if (start != null) { selection += " AND " + time + " >= ?"; args.add(String.valueOf(start)); }
            if (end != null) { selection += " AND " + time + " < ?"; args.add(String.valueOf(end)); }
            Bundle query = new Bundle(); query.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection); query.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args.toArray(new String[0]));
            query.putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, "_id ASC"); query.putInt(ContentResolver.QUERY_ARG_LIMIT, count - entries.length());
            try (Cursor c = resolver.query(MediaStore.Images.Media.getContentUri(volume), projection(), query, signal)) {
                if (c == null) throw new IllegalStateException("系统相册暂不可用，请重试");
                while (entries.length() < count && c.moveToNext()) { signal.throwIfCanceled(); entries.put(entry(c, volume)); after = c.getLong(0); }
            }
            if (entries.length() == count) break;
            volumeIndex++; after = 0;
        }
        Object next = volumeIndex < volumes.size() ? new JSONObject().put("snapshot", snapshot).put("volumeIndex", volumeIndex).put("afterId", after) : JSONObject.NULL;
        return new JSONObject().put("entries", entries).put("cursor", next).put("scopeId", scope()).put("checkpoint", snapshot);
    }
    /**
     * One-tap import: pages the album and returns only photos whose original EXIF
     * holds usable GPS, as compact rows. No pixels or file bytes cross the bridge.
     */
    JSONObject locate(JSONObject options, CancellationSignal signal) throws Exception {
        if (photos().equals("denied")) throw new SecurityException("PHOTO_PERMISSION_REQUIRED：请先允许访问照片");
        ScanWindow.requireLocation(granted(Manifest.permission.ACCESS_MEDIA_LOCATION));
        int count = Math.max(1, Math.min(1000, options.optInt("pageSize", 400)));
        JSONObject cursor = options.optJSONObject("cursor"), since = options.optJSONObject("since");
        List<String> volumes = volumes(); JSONObject snapshot; int total = -1;
        if (cursor == null) {
            JSONObject versions = new JSONObject(), upper = new JSONObject();
            for (String volume : volumes) { versions.put(volume, version(volume)); upper.put(volume, generation(volume)); }
            snapshot = new JSONObject().put("scopeId", scope()).put("versions", versions).put("upper", upper).put("volumes", new JSONArray(volumes));
            cursor = new JSONObject().put("snapshot", snapshot).put("volumeIndex", 0).put("afterId", 0);
            total = 0;
            for (String volume : volumes) {
                Bundle q = locateQuery(volume, snapshot, since, 0, 0);
                try (Cursor c = resolver.query(MediaStore.Images.Media.getContentUri(volume), new String[]{"_id"}, q, signal)) { if (c != null) total += c.getCount(); }
            }
        } else {
            snapshot = cursor.getJSONObject("snapshot");
            if (!snapshot.getString("scopeId").equals(scope()) || !snapshot.getJSONArray("volumes").toString().equals(new JSONArray(volumes).toString()))
                throw new SecurityException("相册授权范围已变化，请重新导入");
        }
        int volumeIndex = cursor.getInt("volumeIndex"); long after = cursor.getLong("afterId"); int scanned = 0;
        if (volumeIndex < 0 || volumeIndex > volumes.size() || after < 0) throw new IllegalArgumentException("扫描游标无效");
        List<String> rowVolumes = new ArrayList<>(); List<Long> ids = new ArrayList<>(); List<Long> taken = new ArrayList<>();
        while (volumeIndex < volumes.size() && ids.size() < count) {
            signal.throwIfCanceled(); String volume = volumes.get(volumeIndex);
            Bundle q = locateQuery(volume, snapshot, since, after, count - ids.size());
            try (Cursor c = resolver.query(MediaStore.Images.Media.getContentUri(volume), new String[]{"_id", "datetaken"}, q, signal)) {
                if (c == null) throw new IllegalStateException("系统相册暂不可用，请重试");
                while (ids.size() < count && c.moveToNext()) { rowVolumes.add(volume); ids.add(c.getLong(0)); taken.add(c.isNull(1) ? 0L : c.getLong(1)); after = c.getLong(0); }
            }
            if (ids.size() == count) break;
            volumeIndex++; after = 0;
        }
        List<Future<JSONArray>> reads = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) { final String volume = rowVolumes.get(i); final long id = ids.get(i), takenMs = taken.get(i); reads.add(exifPool.submit(() -> locateOne(volume, id, takenMs, signal))); }
        JSONArray located = new JSONArray();
        try {
            for (Future<JSONArray> read : reads) { signal.throwIfCanceled(); JSONArray row = read.get(); scanned++; if (row != null) located.put(row); }
        } finally { for (Future<JSONArray> read : reads) read.cancel(true); }
        Object next = volumeIndex < volumes.size() ? new JSONObject().put("snapshot", snapshot).put("volumeIndex", volumeIndex).put("afterId", after) : JSONObject.NULL;
        JSONObject result = new JSONObject().put("located", located).put("scanned", scanned).put("cursor", next).put("checkpoint", snapshot);
        if (total >= 0) result.put("total", total);
        return result;
    }
    private Bundle locateQuery(String volume, JSONObject snapshot, JSONObject since, long after, int limit) throws Exception {
        String selection = "_id > ?"; ArrayList<String> args = new ArrayList<>(); args.add(String.valueOf(after));
        if (Build.VERSION.SDK_INT >= 30) {
            long upper = snapshot.getJSONObject("upper").getLong(volume), lower = -1;
            // Only an unchanged scope and index can skip already-seen rows; anything else rescans and JS deduplicates.
            if (since != null && since.optJSONObject("versions") != null && since.optJSONObject("upper") != null
                    && ScanWindow.incremental(since.optString("scopeId"), scope(), since.getJSONObject("versions").optString(volume), snapshot.getJSONObject("versions").getString(volume), photos().equals("limited")))
                lower = since.getJSONObject("upper").optLong(volume, -1);
            selection += " AND generation_modified > ? AND generation_modified <= ?"; args.add(String.valueOf(lower)); args.add(String.valueOf(upper));
        }
        Bundle query = new Bundle(); query.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection); query.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args.toArray(new String[0]));
        query.putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, "_id ASC"); if (limit > 0) query.putInt(ContentResolver.QUERY_ARG_LIMIT, limit);
        return query;
    }
    /** [volume, id, latitude, longitude, localTime|null, offsetMinutes|null, takenMs|null], or null when unlocated/unreadable. */
    private JSONArray locateOne(String volume, long id, long takenMs, CancellationSignal signal) {
        if (signal.isCanceled()) return null;
        Uri uri = MediaStore.setRequireOriginal(ContentUris.withAppendedId(MediaStore.Images.Media.getContentUri(volume), id));
        try (ParcelFileDescriptor fd = resolver.openFileDescriptor(uri, "r", signal)) {
            if (fd == null) return null;
            ExifInterface exif = new ExifInterface(fd.getFileDescriptor()); float[] ll = new float[2];
            if (!exif.getLatLong(ll) || !PhotoLocation.usable(ll[0], ll[1])) return null;
            String local = PhotoLocation.localTime(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL));
            Integer offset = PhotoLocation.offsetMinutes(exif.getAttribute(ExifInterface.TAG_OFFSET_TIME_ORIGINAL));
            if (local == null && takenMs <= 0) return null;
            return new JSONArray().put(volume).put(String.valueOf(id)).put(ll[0]).put(ll[1]).put(local == null ? JSONObject.NULL : local).put(offset == null ? JSONObject.NULL : offset).put(takenMs > 0 ? takenMs : JSONObject.NULL);
        } catch (Exception unreadable) { return null; }
    }
    /** Small preview for a saved photo pointer, read from the album each time it is shown. */
    JSONObject preview(JSONObject options, CancellationSignal signal) throws Exception {
        ScanWindow.requireDevice(options.optString("deviceId",""),preferences.getString("device",""));
        if (photos().equals("denied")) throw new SecurityException("PHOTO_PERMISSION_REQUIRED：请先允许访问照片");
        String volume = options.getString("volume"), id = options.getString("id"); int edge = Math.max(64, Math.min(512, options.optInt("maxEdge", 320)));
        if (!volumes().contains(volume) || !id.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("照片标识无效");
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.getContentUri(volume), Long.parseLong(id));
        Bitmap bitmap = resolver.loadThumbnail(uri, new android.util.Size(edge, edge), signal);
        try { ByteArrayOutputStream out = new ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.JPEG, 72, out); return new JSONObject().put("base64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)); }
        finally { bitmap.recycle(); }
    }
    private Uri checkedUri(JSONObject handle, CancellationSignal signal) throws Exception {
        return checkedUri(handle, signal, null);
    }
    private Uri checkedUri(JSONObject handle, CancellationSignal signal, long[] size) throws Exception {
        if (!handle.getString("source").equals("android") || !handle.getString("scopeId").equals(scope()) || photos().equals("denied")) throw new SecurityException("照片授权已失效，请重新扫描");
        String volume = handle.getString("volume"), id = handle.getString("localId");
        if (!volumes().contains(volume) || !id.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("照片标识无效");
        if (!version(volume).equals(handle.getString("libraryVersion"))) throw new IllegalStateException("相册索引已重建，请重新扫描");
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.getContentUri(volume), Long.parseLong(id));
        try (Cursor c = resolver.query(uri, projection(), null, null, null, signal)) {
            if (c == null || !c.moveToFirst()) throw new IllegalStateException("照片已删除或无法访问");
            if (!stamp(c).equals(handle.getString("stamp"))) throw new IllegalStateException("照片内容已变化，请重新扫描");
            if (size != null) size[0] = c.getLong(3);
        }
        return uri;
    }
    JSONObject stat(JSONObject handle, CancellationSignal signal) throws Exception {
        Uri uri = checkedUri(handle, signal);
        try (Cursor c = resolver.query(uri, projection(), null, null, null, signal)) {
            if (c == null || !c.moveToFirst()) throw new IllegalStateException("照片已无法访问"); return entry(c, handle.getString("volume"));
        }
    }
    JSONObject read(JSONObject options, CancellationSignal signal) throws Exception {
        ScanWindow.requireLocation(granted(Manifest.permission.ACCESS_MEDIA_LOCATION));
        long[] size = new long[1]; JSONObject handle = options.getJSONObject("handle"); Uri uri = checkedUri(handle, signal, size);
        long offset = options.getLong("offset"); int length = options.getInt("length"); ScanWindow.range(offset, length, size[0]);
        uri = MediaStore.setRequireOriginal(uri);
        byte[] bytes = new byte[length];
        try (ParcelFileDescriptor fd = resolver.openFileDescriptor(uri, "r", signal)) {
            if (fd == null) throw new IllegalStateException("原图不可访问，可能尚未下载到本机");
            try (FileInputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(fd)) {
                FileChannel channel = stream.getChannel(); channel.position(offset); ByteBuffer target = ByteBuffer.wrap(bytes);
                while (target.hasRemaining()) { signal.throwIfCanceled(); if (channel.read(target) < 0) throw new IllegalStateException("照片读取不完整"); }
            }
        }
        return new JSONObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
    }
    JSONObject samples(JSONObject options, CancellationSignal signal) throws Exception {
        ScanWindow.requireLocation(granted(Manifest.permission.ACCESS_MEDIA_LOCATION));
        long[] size = new long[1]; Uri uri = checkedUri(options.getJSONObject("handle"), signal, size);
        int head = options.getInt("headLength"), tail = options.getInt("tailLength");
        if (tail > 65536) throw new IllegalArgumentException("NATIVE_READ_BUDGET");
        ScanWindow.range(0, head, size[0]); ScanWindow.range(size[0] - tail, tail, size[0]);
        byte[] first = new byte[head], last = new byte[tail];
        try (ParcelFileDescriptor fd = resolver.openFileDescriptor(MediaStore.setRequireOriginal(uri), "r", signal)) {
            if (fd == null) throw new IllegalStateException("原图不可访问");
            signal.setOnCancelListener(() -> { try { fd.close(); } catch (java.io.IOException ignored) { } });
            try (FileInputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(fd)) {
                FileChannel channel = stream.getChannel(); readSample(channel, 0, first, signal);
                if (tail > 0) readSample(channel, size[0] - tail, last, signal);
            } finally { signal.setOnCancelListener(null); }
        }
        return new JSONObject().put("headBase64", Base64.encodeToString(first, Base64.NO_WRAP)).put("tailBase64", Base64.encodeToString(last, Base64.NO_WRAP)).put("tailOffset", size[0] - tail);
    }
    private void readSample(FileChannel channel, long offset, byte[] bytes, CancellationSignal signal) throws Exception {
        signal.throwIfCanceled(); channel.position(offset); ByteBuffer buffer = ByteBuffer.wrap(bytes);
        while (buffer.hasRemaining()) { signal.throwIfCanceled(); if (channel.read(buffer) < 0) throw new IllegalStateException("照片读取不完整"); }
    }
    JSONObject thumbnail(JSONObject options, CancellationSignal signal) throws Exception {
        Uri uri = checkedUri(options.getJSONObject("handle"), signal); int edge = options.optInt("maxEdge", 512);
        if (edge < 1 || edge > 512) throw new IllegalArgumentException("缩略图尺寸超限");
        if (stat(options.getJSONObject("handle"), signal).getLong("size") > 64L * 1024 * 1024) throw new IllegalArgumentException("THUMBNAIL_DECODE_BUDGET");
        signal.throwIfCanceled();
        Bitmap bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri), (decoder, info, source) -> {
            int w = info.getSize().getWidth(), h = info.getSize().getHeight();
            if ((long) w * h > 50000000) throw new IllegalArgumentException("THUMBNAIL_DECODE_BUDGET");
            double scale = Math.min(1.0, (double) edge / Math.max(w, h)); decoder.setTargetSize(Math.max(1, (int) Math.round(w * scale)), Math.max(1, (int) Math.round(h * scale))); decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
        });
        try {
            for (int quality : new int[]{78, 60, 42}) { signal.throwIfCanceled(); ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out) && out.size() <= 102400) return new JSONObject().put("base64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            }
            throw new IllegalStateException("THUMBNAIL_SIZE_LIMIT");
        } finally { bitmap.recycle(); }
    }
}
