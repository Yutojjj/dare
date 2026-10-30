package jp.dare.watch;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Rect;
import android.view.MotionEvent;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import org.mozilla.geckoview.*;

/** A separate proof build: Gecko supplies the browser missing on Wear OS. */
public final class WebWatchActivity extends Activity {
    private static GeckoRuntime runtime;
    private GeckoSession session;
    private NativeTimers timers;
    private GeckoView browserView;
    private LinearLayout loadingView;
    private TextView loadingLabel;
    private TimerNoticeView timerNotice;
    private WebExtension.Port navigationPort;
    private boolean webCanGoBack, edgeCandidate, nativeSwiping;
    private float startX, startY;
    private String page = "";
    private long pausedAt;
    private String pendingCastId;
    private static final String HOST = "dare-alpha-ten.vercel.app";
    private boolean trusted(Uri uri) {
        return ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPath().startsWith("/watch/"))
            || ("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPath().startsWith("/watch/"));
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        pendingCastId=getIntent().getStringExtra("castId");
        getWindow().getDecorView().setSystemUiVisibility(5894);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        android.util.Log.i("DareWeb", "create timers"); timers = new NativeTimers(this);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.BLACK));
        android.util.Log.i("DareWeb", "create view"); GeckoView view = new GeckoView(this); browserView=view;
        view.setBackgroundColor(Color.BLACK);
        view.coverUntilFirstPaint(Color.BLACK);
        view.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->view.setSystemGestureExclusionRects(java.util.Collections.singletonList(new Rect(0,0,Math.round(view.getWidth()*.18f),view.getHeight()))));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.addView(view,new FrameLayout.LayoutParams(-1,-1));
        loadingView=new LinearLayout(this); loadingView.setGravity(Gravity.CENTER); loadingView.setOrientation(LinearLayout.VERTICAL); loadingView.setBackgroundColor(Color.BLACK); loadingView.setClickable(true);
        float density=getResources().getDisplayMetrics().density;
        ImageView logo=new ImageView(this); logo.setImageResource(jp.dare.watch.R.drawable.ic_watch);
        loadingView.addView(logo,new LinearLayout.LayoutParams((int)(48*density),(int)(48*density)));
        loadingLabel=new TextView(this); loadingLabel.setText("読み込み中"); loadingLabel.setTextColor(Color.WHITE); loadingLabel.setTextSize(14); loadingLabel.setGravity(Gravity.CENTER); loadingLabel.setPadding(0,(int)(12*density),0,(int)(14*density)); loadingView.addView(loadingLabel);
        ProgressBar progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal); progress.setIndeterminate(true); progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(Color.rgb(169,185,255))); loadingView.addView(progress,new LinearLayout.LayoutParams((int)(110*density),(int)(4*density)));
        root.addView(loadingView,new FrameLayout.LayoutParams(-1,-1)); setContentView(root);
        timerNotice=new TimerNoticeView(this);root.addView(timerNotice,new FrameLayout.LayoutParams(-1,-1));
        android.util.Log.i("DareWeb", "create runtime"); if (runtime == null) runtime = GeckoRuntime.create(getApplicationContext()); android.util.Log.i("DareWeb", "runtime ready");
        session = new GeckoSession();
        session.setContentDelegate(new GeckoSession.ContentDelegate() {
            // The first paint can still be the HTML loading screen. Keep the
            // native cover until the page reports that its layout is ready.
            @Override public void onFirstContentfulPaint(GeckoSession s) { }
        });
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override public GeckoResult<String> onLoadError(GeckoSession s, String uri, WebRequestError error) {
                android.util.Log.e("DareWeb", "Load failed: " + error.toString());
                loadingLabel.setText("読み込めませんでした\nタップして再試行"); loadingView.setVisibility(View.VISIBLE); loadingView.setOnClickListener(v->{loadingLabel.setText("読み込み中");session.reload();});
                return null;
            }
            @Override public void onLocationChange(GeckoSession s, String url, java.util.List<GeckoSession.PermissionDelegate.ContentPermission> permissions, Boolean userGesture) { page = url; }
            @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, LoadRequest request) {
                Uri uri = Uri.parse(request.uri);
                if ("darewatch".equals(uri.getScheme())) {
                    Uri origin = Uri.parse(page);
                    if (trusted(origin)) {
                        try {
                            if ("ready".equals(uri.getHost())) { loadingView.setVisibility(View.GONE); openPendingCast(); }
                            if ("test".equals(uri.getHost())) { timers.testNotification(true); android.widget.Toast.makeText(WebWatchActivity.this,"5秒後にテスト通知します",android.widget.Toast.LENGTH_SHORT).show(); }
                            if ("permissions".equals(uri.getHost())) {
                                if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},20);
                                if (android.os.Build.VERSION.SDK_INT >= 31) startActivity(new android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));
                            }
                            String raw = uri.getQueryParameter("payload");
                            if (raw != null && raw.length() <= 1000000 && "sync".equals(uri.getHost())) { timers.syncTimers(raw); WatchTileService.save(WebWatchActivity.this,raw); }
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
        final String target=preview != null && trusted(Uri.parse(preview)) ? preview : "https://" + HOST + "/watch/index.html?native=gecko";
        runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/watch-navigation/","watch-navigation@dare.local").accept(extension->{
            if(isFinishing()||isDestroyed())return;
            session.getWebExtensionController().setMessageDelegate(extension,new WebExtension.MessageDelegate(){
                @Override public void onConnect(WebExtension.Port port){
                    if(port.sender.session!=session || !port.sender.isTopLevel() || port.sender.url==null || !trusted(Uri.parse(port.sender.url))){port.disconnect();return;}
                    navigationPort=port;
                    port.setDelegate(new WebExtension.PortDelegate(){
                        @Override public void onPortMessage(Object message,WebExtension.Port from){if(message instanceof org.json.JSONObject){org.json.JSONObject state=(org.json.JSONObject)message;webCanGoBack=state.optBoolean("canBack");if(state.optBoolean("ready")){loadingView.setVisibility(View.GONE);openPendingCast();}}}
                        @Override public void onDisconnect(WebExtension.Port from){if(navigationPort==from){navigationPort=null;webCanGoBack=false;}}
                    });
                }
            },"dare_watch_navigation");
            session.loadUri(target);
        }, error->{android.util.Log.e("DareWeb","Navigation bridge unavailable",error);if(!isFinishing()&&!isDestroyed())session.loadUri(target);});
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 20);
    }
    @Override protected void onResume() { super.onResume(); NativeTimers.foregroundActive=true;NativeTimers.foregroundAlert=entry->{if(timerNotice!=null)timerNotice.show(entry);};if (session != null) session.setActive(true); if (timers != null) timers.restore(); }
    @Override protected void onPause() { NativeTimers.foregroundActive=false;NativeTimers.foregroundAlert=null;pausedAt=System.currentTimeMillis(); if (session != null) session.setActive(false); super.onPause(); }
    @Override protected void onDestroy() { if (session != null) session.close(); super.onDestroy(); }
    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if(browserView==null)return super.dispatchTouchEvent(event);
        int action=event.getActionMasked();
        if(action==MotionEvent.ACTION_DOWN){startX=event.getX();startY=event.getY();nativeSwiping=false;edgeCandidate=(timerNotice.showing()||(navigationPort!=null&&loadingView.getVisibility()!=View.VISIBLE))&&startX<browserView.getWidth()*.55f;if(edgeCandidate&&browserView.getParent()!=null)browserView.getParent().requestDisallowInterceptTouchEvent(true);}
        if(action==MotionEvent.ACTION_MOVE&&edgeCandidate){float dx=event.getX()-startX,dy=Math.abs(event.getY()-startY);if(!nativeSwiping&&dx>browserView.getWidth()*.08f&&dx>dy*1.3f){nativeSwiping=true;MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();}if(nativeSwiping)return true;}
        if(action==MotionEvent.ACTION_UP&&nativeSwiping){float dx=event.getX()-startX;nativeSwiping=false;edgeCandidate=false;if(dx>browserView.getWidth()*.25f){backHaptic();navigateBack();}return true;}
        if(action==MotionEvent.ACTION_CANCEL){boolean consumed=nativeSwiping;nativeSwiping=false;edgeCandidate=false;if(consumed)return true;}
        return super.dispatchTouchEvent(event);
    }
    private void sendWebBack(){if(navigationPort!=null){org.json.JSONObject command=new org.json.JSONObject();try{command.put("type","back");navigationPort.postMessage(command);}catch(org.json.JSONException error){android.util.Log.e("DareWeb","Back command failed",error);}}}
    @Override protected void onNewIntent(android.content.Intent intent){super.onNewIntent(intent);setIntent(intent);String preview=intent.getStringExtra("previewUrl");if(preview!=null&&trusted(Uri.parse(preview))){loadingView.setVisibility(View.VISIBLE);session.loadUri(preview);}pendingCastId=intent.getStringExtra("castId");if(loadingView.getVisibility()!=View.VISIBLE)openPendingCast();}
    private void openPendingCast(){if(pendingCastId==null||navigationPort==null)return;try{org.json.JSONObject command=new org.json.JSONObject().put("type","openCast").put("castId",pendingCastId);navigationPort.postMessage(command);pendingCastId=null;}catch(org.json.JSONException ignored){}}
    private void backHaptic(){android.os.Vibrator vibrator=(android.os.Vibrator)getSystemService(VIBRATOR_SERVICE);if(vibrator!=null&&vibrator.hasVibrator())vibrator.vibrate(android.os.VibrationEffect.createOneShot(22,android.os.VibrationEffect.DEFAULT_AMPLITUDE));}
    private void navigateBack(){if(timerNotice!=null&&timerNotice.showing())timerNotice.dismiss();else if(navigationPort!=null&&webCanGoBack)sendWebBack();else finishAndRemoveTask();}
    @Override public void onBackPressed(){navigateBack();}
}
