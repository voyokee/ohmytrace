package com.ohmytrace.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private MediaLibrary library;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, CancellationSignal> operations = new ConcurrentHashMap<>();
    private JavaScriptReplyProxy permissionReply;
    private String permissionId;
    private ValueCallback<Uri[]> fileReply;
    // The bundled Cesium/editor runtime requires JavaScript. Only the app's
    // local origin receives the bridge; external navigation leaves the WebView.
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); library = new MediaLibrary(this); web = new WebView(this);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView message = new TextView(this); message.setText(R.string.webview_update_required); setContentView(message); return;
        }
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse result = loader.shouldInterceptRequest(request.getUrl());
                if (result == null && "appassets.androidplatform.net".equals(request.getUrl().getHost())) return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                return result;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl(); if (local(url)) return false;
                if (request.isForMainFrame() && ("https".equals(url.getScheme()) || "http".equals(url.getScheme()))) startActivity(new Intent(Intent.ACTION_VIEW, url));
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { cancelAll(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确认", (dialog, which) -> result.confirm()).setNegativeButton("取消", (dialog, which) -> result.cancel()).setOnCancelListener(dialog -> result.cancel()).show(); return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileReply != null) fileReply.onReceiveValue(null); fileReply = callback;
                Intent intent = params.createIntent(); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                startActivityForResult(intent, 20); return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.addWebMessageListener(web, "OhMyTraceMedia", Collections.singleton(ORIGIN), (view, message, sourceOrigin, isMainFrame, reply) -> {
            if (!isMainFrame || !ORIGIN.equals(sourceOrigin.toString()) || view.getUrl() == null || !"/assets/index.html".equals(Uri.parse(view.getUrl()).getPath())) return;
            String id = "";
            try {
                String text = message.getData(); if (text == null || text.length() > 1000000) throw new IllegalArgumentException("请求容量超限");
                JSONObject request = new JSONObject(text); id = request.getString("id"); String method = request.getString("method"); JSONObject params = request.optJSONObject("params");
                if (params == null) params = new JSONObject();
                if (method.equals("cancel")) { CancellationSignal signal = operations.get(params.optString("requestId")); if (signal != null) signal.cancel(); return; }
                if (method.equals("requestPermission")) { requestPermission(id, params.optBoolean("location"), reply); return; }
                final String jobId = id; final JSONObject options = params; CancellationSignal signal = new CancellationSignal();
                if (operations.putIfAbsent(id, signal) != null) throw new IllegalArgumentException("重复请求标识");
                io.execute(() -> {
                    try { signal.throwIfCanceled(); Object result;
                        switch (method) {
                            case "permissionStatus": result = library.permissions(); break;
                            case "enumerate": result = library.enumerate(options, signal); break;
                            case "readRange": result = library.read(options, signal); break;
                            case "readSamples": result = library.samples(options, signal); break;
                            case "stat": result = library.stat(options.getJSONObject("handle"), signal); break;
                            case "thumbnail": result = library.thumbnail(options, signal); break;
                            default: throw new IllegalArgumentException("未知相册请求");
                        }
                        respond(reply, jobId, result, null);
                    } catch (Exception error) { respond(reply, jobId, null, error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()); }
                    finally { operations.remove(jobId); }
                });
            } catch (Exception error) { respond(reply, id, null, error.getMessage()); }
        });
        // API 35 edge-to-edge: keep the photo dialog clear of system bars.
        if (Build.VERSION.SDK_INT >= 30) web.setOnApplyWindowInsetsListener((view, insets) -> { android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars()); view.setPadding(bars.left, bars.top, bars.right, bars.bottom); return insets; });
        setContentView(web); web.loadUrl(ORIGIN + "/assets/index.html");
    }
    private boolean local(Uri uri) { return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/assets/"); }
    private void requestPermission(String id, boolean location, JavaScriptReplyProxy reply) throws Exception {
        if (permissionReply != null) throw new IllegalStateException("相册授权窗口已打开");
        ArrayList<String> permissions = new ArrayList<>();
        // GPS permission is a separate user action and never requests live location.
        if (location) permissions.add(Manifest.permission.ACCESS_MEDIA_LOCATION);
        else {
            permissions.add(Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE);
            if (Build.VERSION.SDK_INT >= 34) permissions.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
        }
        permissionReply = reply; permissionId = id; requestPermissions(permissions.toArray(new String[0]), 10);
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 10 && permissionReply != null) { library.permissionChanged();
            try { respond(permissionReply, permissionId, library.permissions(), null); } catch (Exception error) { respond(permissionReply, permissionId, null, error.getMessage()); }
            permissionReply = null; permissionId = null;
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 20 && fileReply != null) { fileReply.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileReply = null; }
    }
    private void respond(JavaScriptReplyProxy reply, String id, Object result, String error) {
        try { JSONObject payload = new JSONObject().put("id", id); if (error != null) payload.put("error", error); else payload.put("result", result == null ? JSONObject.NULL : result);
            runOnUiThread(() -> { try { if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(payload.toString()); } catch (Exception ignored) { } });
        } catch (Exception ignored) { /* Page may have been destroyed. */ }
    }
    private void cancelAll() { for (CancellationSignal signal : operations.values()) signal.cancel(); }
    @Override protected void onDestroy() { cancelAll(); io.shutdownNow(); if (web != null) { web.destroy(); } super.onDestroy(); }
}
