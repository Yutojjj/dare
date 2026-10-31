package jp.dare.watch;

import android.content.*;
import android.content.res.Configuration;
import android.os.*;
import org.mozilla.geckoview.*;

/** Bounded, inactive browser reuse. No service, wake lock or extra polling. */
final class WarmWatchSession {
    static final long RETAIN_MS=90_000;
    static final class Entry {
        final GeckoSession session; final WebExtension.Port port; final String page; final boolean canBack;
        Entry(GeckoSession session,WebExtension.Port port,String page,boolean canBack){this.session=session;this.port=port;this.page=page;this.canBack=canBack;}
    }
    private static final Handler handler=new Handler(Looper.getMainLooper());
    private static Entry cached;
    private static long expiresAt;
    private static boolean registered;
    private static final Runnable expire=WarmWatchSession::clear;
    static Entry take(String explicitUrl){
        if(explicitUrl!=null||SystemClock.elapsedRealtime()>=expiresAt){clear();return null;}
        Entry result=cached;cached=null;handler.removeCallbacks(expire);return result;
    }
    static void keep(Context context,Entry entry){
        clear();cached=entry;expiresAt=SystemClock.elapsedRealtime()+RETAIN_MS;
        handler.postDelayed(expire,RETAIN_MS);
        if(!registered){registered=true;context.getApplicationContext().registerComponentCallbacks(new ComponentCallbacks2(){
            @Override public void onConfigurationChanged(Configuration configuration){}
            @Override public void onLowMemory(){clear();}
            @Override public void onTrimMemory(int level){if(level==TRIM_MEMORY_RUNNING_LOW||level==TRIM_MEMORY_RUNNING_CRITICAL||level>=TRIM_MEMORY_BACKGROUND)clear();}
        });}
    }
    static void clear(){handler.removeCallbacks(expire);Entry old=cached;cached=null;if(old!=null)old.session.close();}
    static void forgetPort(WebExtension.Port port){if(cached!=null&&cached.port==port)clear();}
}
