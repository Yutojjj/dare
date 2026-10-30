package jp.dare.watch;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Rect;
import android.view.MotionEvent;
import org.mozilla.geckoview.*;

/** A separate proof build: Gecko supplies the browser missing on Wear OS. */
public final class WebWatchActivity extends Activity {
    private static GeckoRuntime runtime;
    private GeckoSession session;
    private NativeTimers timers;
    private GeckoView browserView;
    private String page = "";
    private long pausedAt;
    private static final String HOST = "dare-alpha-ten.vercel.app";
    private boolean trusted(Uri uri) {
        return ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPath().startsWith("/watch/"))
            || ("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPath().startsWith("/watch/"));
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().getDecorView().setSystemUiVisibility(5894);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        android.util.Log.i("DareWeb", "create timers"); timers = new NativeTimers(this);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.BLACK));
        android.util.Log.i("DareWeb", "create view"); GeckoView view = new GeckoView(this); browserView=view;
        view.setBackgroundColor(Color.BLACK);
        view.coverUntilFirstPaint(Color.BLACK);
        view.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->view.setSystemGestureExclusionRects(java.util.Collections.singletonList(new Rect(0,0,Math.round(view.getWidth()*.18f),view.getHeight()))));
        setContentView(view);
        android.util.Log.i("DareWeb", "create runtime"); if (runtime == null) runtime = GeckoRuntime.create(getApplicationContext()); android.util.Log.i("DareWeb", "runtime ready");
        session = new GeckoSession();
        session.setContentDelegate(new GeckoSession.ContentDelegate() {});
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override public GeckoResult<String> onLoadError(GeckoSession s, String uri, WebRequestError error) {
                android.util.Log.e("DareWeb", "Load failed: " + error.toString());
                return null;
            }
            @Override public void onLocationChange(GeckoSession s, String url, java.util.List<GeckoSession.PermissionDelegate.ContentPermission> permissions, Boolean userGesture) { page = url; }
            @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, LoadRequest request) {
                Uri uri = Uri.parse(request.uri);
                if ("darewatch".equals(uri.getScheme())) {
                    Uri origin = Uri.parse(page);
                    if (trusted(origin)) {
                        try {
                            if ("test".equals(uri.getHost())) { timers.testNotification(true); android.widget.Toast.makeText(WebWatchActivity.this,"5秒後にテスト通知します",android.widget.Toast.LENGTH_SHORT).show(); }
                            if ("permissions".equals(uri.getHost())) {
                                if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},20);
                                if (android.os.Build.VERSION.SDK_INT >= 31) startActivity(new android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));
                            }
                            String raw = uri.getQueryParameter("payload");
                            if (raw != null && raw.length() <= 1000000 && "sync".equals(uri.getHost())) timers.syncTimers(raw);
                        } catch (Exception error) { android.util.Log.e("DareWeb", "Timer bridge rejected", error); }
                    }
                    return GeckoResult.fromValue(AllowOrDeny.DENY);
                }
                boolean allowed = trusted(uri) || "about:blank".equals(request.uri);
                return GeckoResult.fromValue(allowed ? AllowOrDeny.ALLOW : AllowOrDeny.DENY);
            }
        });
        android.util.Log.i("DareWeb", "open session"); session.open(runtime);
        view.setSession(session);
        android.util.Log.i("DareWeb", "load page"); String preview = getIntent().getStringExtra("previewUrl");
        session.loadUri(preview != null && trusted(Uri.parse(preview)) ? preview : "https://" + HOST + "/watch/index.html?native=gecko");
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 20);
    }
    @Override protected void onResume() { super.onResume(); if (session != null) { session.setActive(true); if(pausedAt>0 && System.currentTimeMillis()-pausedAt>60000) session.reload(); } if (timers != null) timers.restore(); }
    @Override protected void onPause() { pausedAt=System.currentTimeMillis(); if (session != null) session.setActive(false); super.onPause(); }
    @Override protected void onDestroy() { if (session != null) session.close(); super.onDestroy(); }
    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if(browserView!=null && event.getActionMasked()==MotionEvent.ACTION_DOWN && event.getX()<browserView.getWidth()*.55f && browserView.getParent()!=null) browserView.getParent().requestDisallowInterceptTouchEvent(true);
        return super.dispatchTouchEvent(event);
    }
}
