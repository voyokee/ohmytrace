package com.ohmytrace.app;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** Runs against an actual emulator/device MediaProvider, using synthetic photos only. */
@RunWith(AndroidJUnit4.class)
public class MediaLibraryTest {
    private Context context;
    private MediaLibrary library;
    private final List<Uri> inserted = new ArrayList<>();
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext(); library = new MediaLibrary(context);
        String mediaPermission = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE;
        for (String permission : new String[]{mediaPermission, Manifest.permission.ACCESS_MEDIA_LOCATION}) {
            try (android.os.ParcelFileDescriptor command = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant " + context.getPackageName() + " " + permission);
                 InputStream result = new android.os.ParcelFileDescriptor.AutoCloseInputStream(command)) { byte[] buffer = new byte[1024]; while (result.read(buffer) != -1) { } }
        }
    }
    @After public void cleanup() { for (Uri uri : inserted) context.getContentResolver().delete(uri, null, null); }
    @Test public void deniedGpsBlocksEnumerationAndReadsBeforeOpeningAnyOriginal() throws Exception {
        Context deniedGps = new android.content.ContextWrapper(context) {
            @Override public int checkSelfPermission(String permission) {
                return Manifest.permission.ACCESS_MEDIA_LOCATION.equals(permission) ? android.content.pm.PackageManager.PERMISSION_DENIED : super.checkSelfPermission(permission);
            }
        };
        MediaLibrary blocked = new MediaLibrary(deniedGps);
        try { blocked.enumerate(options(null, 100), new CancellationSignal()); fail("GPS-redacted enumeration accepted"); } catch (SecurityException expected) { assertTrue(expected.getMessage().contains("GPS_PERMISSION_REQUIRED")); }
        try { blocked.read(new JSONObject(), new CancellationSignal()); fail("GPS-redacted original read accepted"); } catch (SecurityException expected) { assertTrue(expected.getMessage().contains("GPS_PERMISSION_REQUIRED")); }
    }
    private Uri insert(String fixture, String mime, long taken) throws Exception {
        ContentValues values = new ContentValues(); values.put(MediaStore.Images.Media.DISPLAY_NAME, "ohmytrace-test-" + System.nanoTime() + "." + (mime.equals("image/heic") ? "heic" : "jpg"));
        values.put(MediaStore.Images.Media.MIME_TYPE, mime); values.put(MediaStore.Images.Media.DATE_TAKEN, taken); values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = context.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values); assertNotNull(uri); inserted.add(uri);
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(fixture); OutputStream output = context.getContentResolver().openOutputStream(uri)) { byte[] buffer = new byte[8192]; int n; while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n); }
        ContentValues ready = new ContentValues(); ready.put(MediaStore.Images.Media.IS_PENDING, 0); context.getContentResolver().update(uri, ready, null, null); return uri;
    }
    private JSONObject options(JSONObject since, int count) throws Exception { return new JSONObject().put("startMs", 1735689600000L).put("endMs", 1767225600000L).put("pageSize", count).put("since", since == null ? JSONObject.NULL : since); }
    private JSONObject find(Uri uri) throws Exception {
        JSONObject options = options(null, 100);
        do { JSONObject page = library.enumerate(options, new CancellationSignal()); JSONArray entries = page.getJSONArray("entries");
            for (int i = 0; i < entries.length(); i++) if (entries.getJSONObject(i).getJSONObject("handle").getString("localId").equals(uri.getLastPathSegment())) return entries.getJSONObject(i);
            if (page.isNull("cursor")) break; options.put("cursor", page.getJSONObject("cursor"));
        } while (true); throw new AssertionError("Inserted photo absent from ranged enumeration");
    }
    @Test public void actualRangePagingReadAndPermissionRevocation() throws Exception {
        Uri first = insert("photo-base.jpg", "image/jpeg", 1746064800000L), second = insert("photo-gps.heic", "image/heic", 1746151200000L);
        JSONObject options = options(null, 1); List<String> ids = new ArrayList<>();
        do { JSONObject page = library.enumerate(options, new CancellationSignal()); JSONArray entries = page.getJSONArray("entries"); assertTrue(entries.length() <= 1);
            for (int i = 0; i < entries.length(); i++) ids.add(entries.getJSONObject(i).getJSONObject("handle").getString("localId"));
            if (page.isNull("cursor")) break; options.put("cursor", page.getJSONObject("cursor"));
        } while (true);
        assertTrue(ids.contains(first.getLastPathSegment())); assertTrue(ids.contains(second.getLastPathSegment())); assertEquals(ids.size(), new java.util.HashSet<>(ids).size());
        JSONObject entry = find(second), handle = entry.getJSONObject("handle");
        byte[] bytes = Base64.decode(library.read(new JSONObject().put("handle", handle).put("offset", 0).put("length", 32), new CancellationSignal()).getString("base64"), Base64.DEFAULT); assertEquals(32, bytes.length);
        library.permissionChanged();
        try { library.stat(handle, new CancellationSignal()); fail("stale permission scope accepted"); } catch (SecurityException expected) { }
    }
    @Test public void androidDecoderProducesSmallMetadataFreeHEICThumbnail() throws Exception {
        Uri photo = insert("photo-gps.heic", "image/heic", 1746064800000L); JSONObject entry = find(photo);
        byte[] bytes = Base64.decode(library.thumbnail(new JSONObject().put("handle", entry.getJSONObject("handle")).put("maxEdge", 128), new CancellationSignal()).getString("base64"), Base64.DEFAULT);
        assertTrue(bytes.length <= 102400); assertEquals(0xff, bytes[0] & 255); assertEquals(0xd8, bytes[1] & 255);
        String text = new String(bytes, java.nio.charset.StandardCharsets.ISO_8859_1); assertFalse(text.contains("Exif\0\0")); assertFalse(text.contains("xmpmeta"));
        android.graphics.Bitmap bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes))); assertTrue(bitmap.getWidth() <= 128 && bitmap.getHeight() <= 128); bitmap.recycle();
    }
    @Test public void laterAddedOldCaptureDateIsIncludedByGenerationIncrementalScan() throws Exception {
        org.junit.Assume.assumeTrue(Build.VERSION.SDK_INT >= 30);
        JSONObject opts = options(null, 100), page;
        do { page = library.enumerate(opts, new CancellationSignal()); if (page.isNull("cursor")) break; opts.put("cursor", page.getJSONObject("cursor")); } while (true);
        JSONObject checkpoint = page.getJSONObject("checkpoint"); Uri backdated = insert("photo-base.jpg", "image/jpeg", 1746064800000L);
        JSONObject incremental = options(checkpoint, 100); boolean found = false;
        do { page = library.enumerate(incremental, new CancellationSignal()); JSONArray entries = page.getJSONArray("entries");
            for (int i = 0; i < entries.length(); i++) if (entries.getJSONObject(i).getJSONObject("handle").getString("localId").equals(backdated.getLastPathSegment())) found = true;
            if (page.isNull("cursor")) break; incremental.put("cursor", page.getJSONObject("cursor"));
        } while (true); assertTrue(found);
    }
}
