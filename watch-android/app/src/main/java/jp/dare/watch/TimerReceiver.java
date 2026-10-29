package jp.dare.watch;
import android.content.*;
public final class TimerReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        NativeTimers timers = new NativeTimers(context);
        if ("jp.dare.watch.TIMER".equals(intent.getAction())) timers.deliver(intent.getStringExtra("castId"));
        else timers.restore();
    }
}
