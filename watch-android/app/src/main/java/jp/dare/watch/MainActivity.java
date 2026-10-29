package jp.dare.watch;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final String WATCH_URL = "https://dare-alpha-ten.vercel.app/watch/";
    private static final String WATCH_HOST = "dare-alpha-ten.vercel.app";

    private WebView webView;
    private View errorPanel;
    private boolean pageFailed;
    private boolean started;
    private NativeTimers nativeTimers;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        nativeTimers = new NativeTimers(this);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(9, 11, 15));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(9, 11, 15));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        webView.addJavascriptInterface(nativeTimers, "DareWatchNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                android.net.Uri url = request.getUrl();
                return !"https".equals(url.getScheme())
                        || !WATCH_HOST.equals(url.getHost())
                        || !url.getPath().startsWith("/watch");
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageFailed = false;
                errorPanel.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    pageFailed = true;
                    errorPanel.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!pageFailed) errorPanel.setVisibility(View.GONE);
                android.net.Uri uri = android.net.Uri.parse(url);
                if (!pageFailed && "https".equals(uri.getScheme()) && WATCH_HOST.equals(uri.getHost())
                        && uri.getPath().startsWith("/watch/")) {
                    view.evaluateJavascript("(() => { if(window.__dareNativeTimers) return; window.__dareNativeTimers=true;"
                        + "const sync=()=>{try{const raw=localStorage.getItem('cast-watch-v1');if(raw){const state=JSON.parse(raw);state.notificationSettings=JSON.parse(localStorage.getItem('watch-alert-settings-v1')||'null');DareWatchNative.syncTimers(JSON.stringify(state));}}catch(e){}};"
                        + "const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(k==='cast-watch-v1'||k==='watch-alert-settings-v1')sync();};"
                        + "window.addEventListener('pagehide',sync);sync();"
                        + "try{Object.defineProperty(navigator,'vibrate',{value:()=>true});}catch(e){}"
                        + "})()", null);
                }
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(Gravity.CENTER);
        error.setPadding(dp(34), dp(24), dp(34), dp(24));
        error.setBackgroundColor(Color.rgb(9, 11, 15));
        TextView message = new TextView(this);
        message.setText("ウォッチ画面を読み込めませんでした。\n通信を確認して再試行してください。");
        message.setTextColor(Color.WHITE);
        message.setTextSize(15);
        message.setGravity(Gravity.CENTER);
        error.addView(message);
        Button retry = new Button(this);
        retry.setText("再試行");
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(56, 68, 81)));
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(130), dp(48));
        retryParams.topMargin = dp(16);
        error.addView(retry, retryParams);
        retry.setOnClickListener(v -> webView.loadUrl(WATCH_URL));
        errorPanel = error;
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (state != null) webView.restoreState(state);
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 20);
        else requestTimerPermission();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 20) requestTimerPermission();
    }

    private void requestTimerPermission() {
        if (android.os.Build.VERSION.SDK_INT < 31 || getSystemService(android.app.AlarmManager.class).canScheduleExactAlarms()
                || getPreferences(0).getBoolean("alarmPermissionAsked", false)) return;
        getPreferences(0).edit().putBoolean("alarmPermissionAsked", true).apply();
        new android.app.AlertDialog.Builder(this).setMessage("画面を閉じている間もタイマー終了を知らせるため、次の画面でアラームの使用を許可してください。")
            .setPositiveButton("設定を開く", (dialog, which) -> {
                try { startActivity(new android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    android.net.Uri.parse("package:" + getPackageName()))); } catch (android.content.ActivityNotFoundException ignored) { }
            }).setNegativeButton("あとで", null).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        nativeTimers.restore();
        if (started) webView.loadUrl(WATCH_URL);
        else {
            started = true;
            if (webView.getUrl() == null) webView.loadUrl(WATCH_URL);
        }
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    private int dp(int size) {
        return Math.round(size * getResources().getDisplayMetrics().density);
    }
}
