package jp.dare.watch;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;

import org.json.*;
import java.util.Iterator;

/** Android owns scheduled notifications; web storage remains the timer source of truth. */
public final class NativeTimers {
    static volatile boolean foregroundActive;
    static volatile java.util.function.Consumer<JSONObject> foregroundAlert;
    static final String CHANNEL = "watch-timers";
    private static final Object LOCK = new Object();
    private final Context context;
    public NativeTimers(Context context) {
        this.context = context.getApplicationContext();
        NotificationChannel channel = new NotificationChannel(CHANNEL, "タイマー終了", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 300, 150, 300, 150, 600});
        channel.setSound(null, null);
        this.context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        NotificationChannel quiet = new NotificationChannel(CHANNEL + "-quiet", "タイマー（振動なし）", NotificationManager.IMPORTANCE_HIGH);
        quiet.enableVibration(false);
        quiet.setSound(null, null);
        this.context.getSystemService(NotificationManager.class).createNotificationChannel(quiet);
        NotificationChannel visible=new NotificationChannel(CHANNEL+"-in-app","アプリ表示中の通知履歴",NotificationManager.IMPORTANCE_LOW);
        visible.enableVibration(false);visible.setSound(null,null);
        this.context.getSystemService(NotificationManager.class).createNotificationChannel(visible);
    }
    private android.content.SharedPreferences prefs() { return context.getSharedPreferences("native-timers", 0); }
    private JSONObject read() {
        try { return new JSONObject(prefs().getString("timers", "{}")); }
        catch (JSONException e) { return new JSONObject(); }
    }
    private PendingIntent alarm(String id) {
        Intent intent = new Intent(context, TimerReceiver.class).setAction("jp.dare.watch.TIMER")
            .setData(Uri.parse("dare-watch://timer/" + Uri.encode(id))).putExtra("castId", id);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private void schedule(String id, long end) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        long trigger = Math.max(System.currentTimeMillis() + 100, end);
        if (Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms())
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, alarm(id));
        else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, alarm(id));
        android.util.Log.i("DareTimers", "Scheduled " + id + " at " + trigger);
    }
    public void syncTimers(String raw) { synchronized (LOCK) { sync(raw); } }
    private void sync(String raw) {
        if (raw == null || raw.length() > 2_000_000) return;
        try {
            JSONObject state = new JSONObject(raw), incoming = state.getJSONObject("timers"), old = read(), next = new JSONObject();
            JSONArray casts = state.getJSONArray("casts");
            JSONObject settings = state.optJSONObject("notificationSettings");
            JSONArray advances = settings == null ? new JSONArray() : settings.optJSONArray("advanceSecondsList");
            if (advances == null) advances = new JSONArray().put(settings.optInt("advanceSeconds"));
            boolean endEnabled = settings == null || settings.optBoolean("endEnabled", true);
            boolean vibration = settings == null || settings.optBoolean("vibration", true);
            Iterator<String> testIds=old.keys();
            while(testIds.hasNext()){String key=testIds.next();JSONObject test=old.optJSONObject(key);if(test!=null&&test.optBoolean("test")&&!test.optBoolean("delivered"))next.put(key,test);}
            for (int i = 0; i < casts.length(); i++) {
                JSONObject cast = casts.getJSONObject(i); String id = cast.getString("id");
                JSONObject timer = incoming.optJSONObject(id);
                if (timer == null || timer.optBoolean("paused")) continue;
                if (timer.optBoolean("alerted") && !old.has(id)) continue;
                long end = timer.optLong("endsAt", 0); if (end <= 0) continue;
                if (endEnabled) addEntry(next, old, id, end, end, cast.optString("name", "キャスト"), vibration, 0, state, cast);
                for (int j = 0; j < Math.min(advances.length(), 20); j++) {
                    int advance = advances.optInt(j);
                    if (advance <= 0 || advance > 3600) continue;
                    long warning = end - advance * 1000L;
                    String warningId = id + "|advance:" + advance;
                    // Do not send a newly enabled warning retroactively; keep existing delivered state.
                    if (warning > System.currentTimeMillis() || old.has(warningId))
                        addEntry(next, old, warningId, warning, end, cast.optString("name", "キャスト"), vibration, advance, state, cast);
                }
            }
            // Persist before scheduling so an immediate alarm can read the latest state.
            prefs().edit().putString("timers", next.toString()).commit();
            Iterator<String> removed = old.keys();
            while (removed.hasNext()) { String id = removed.next(); if (!next.has(id)) context.getSystemService(AlarmManager.class).cancel(alarm(id)); }
            Iterator<String> ids = next.keys();
            while (ids.hasNext()) {
                String id = ids.next(); JSONObject entry = next.getJSONObject(id), prior = old.optJSONObject(id);
                if (!entry.optBoolean("delivered") && (prior == null || prior.optLong("end") != entry.optLong("end"))) schedule(id, entry.getLong("end"));
            }
        } catch (JSONException ignored) { }
    }
    private void addEntry(JSONObject next, JSONObject old, String id, long at, long timerEnd, String name, boolean vibration, int advance, JSONObject state, JSONObject cast) throws JSONException {
        JSONObject prior = old.optJSONObject(id);
        boolean same = prior != null && prior.optLong("end") == at && prior.optLong("timerEnd", timerEnd) == timerEnd;
        next.put(id, new JSONObject().put("end", at).put("timerEnd", timerEnd).put("name", name)
            .put("vibration", vibration).put("advance", advance).put("delivered", same && prior.optBoolean("delivered"))
            .put("castId",cast.optString("id")).put("fromTableName",WatchModel.fullTableName(state,cast.optString("currentTableId")))
            .put("toTableName",WatchModel.fullTableName(state,cast.optString("destinationTableId"))));
    }
    public void vibrate(int milliseconds) {
        int duration = Math.max(1, Math.min(2000, milliseconds));
        Vibrator vibrator=context.getSystemService(Vibrator.class);
        if(vibrator!=null&&vibrator.hasVibrator())vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
    }
    void testNotification(boolean vibration){synchronized(LOCK){try{String id="native-test-"+System.currentTimeMillis();long end=System.currentTimeMillis()+5000;JSONObject timers=read();JSONObject entry=new JSONObject().put("end",end).put("timerEnd",end).put("name","テストキャスト").put("fromTableName","1階・1卓").put("toTableName","2階・8卓").put("vibration",vibration).put("advance",0).put("delivered",false).put("test",true);JSONObject state=new JSONObject(context.getSharedPreferences("watch-native",0).getString("state","{}"));JSONArray casts=state.optJSONArray("casts");if(casts!=null&&casts.length()>0){JSONObject cast=casts.getJSONObject(0);entry.put("name",cast.optString("name")).put("fromTableName",WatchModel.fullTableName(state,cast.optString("currentTableId"))).put("toTableName",WatchModel.fullTableName(state,cast.optString("destinationTableId")));}timers.put(id,entry);prefs().edit().putString("timers",timers.toString()).commit();schedule(id,end);}catch(JSONException e){android.util.Log.e("DareTimers","Test failed",e);}}}
    static String routeText(JSONObject entry){String from=entry.optString("fromTableName","未設定"),to=entry.optString("toTableName","未設定");return from+"\n↓\n"+(to.equals("未設定")?"次の卓は未設定":to);}
    void restore() { synchronized (LOCK) { restoreLocked(); } }
    private void restoreLocked() {
        JSONObject timers = read(); Iterator<String> ids = timers.keys();
        while (ids.hasNext()) { String id = ids.next(); JSONObject entry = timers.optJSONObject(id); if (!entry.optBoolean("delivered")) schedule(id, entry.optLong("end")); }
    }
    void deliver(String id) { synchronized (LOCK) { deliverLocked(id); } }
    private void deliverLocked(String id) {
        JSONObject timers = read(), entry = timers.optJSONObject(id);
        if (entry == null || entry.optBoolean("delivered")) return;
        if (entry.optLong("end") > System.currentTimeMillis() + 500) { schedule(id, entry.optLong("end")); return; }
        try { entry.put("delivered", true); prefs().edit().putString("timers", timers.toString()).commit(); } catch (JSONException ignored) { }
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) launch = new Intent(context, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int advance = entry.optInt("advance");
        if (advance > 0 && entry.optLong("timerEnd") <= System.currentTimeMillis()) return;
        boolean vibration = entry.optBoolean("vibration", true);
        String message=entry.optString("name")+(advance>0?"　終了"+advance+"秒前です":"　時間です");
        boolean foreground=foregroundActive;
        java.util.function.Consumer<JSONObject> listener=foregroundAlert;
        boolean inApp=foreground&&listener!=null;
        if(inApp)new Handler(Looper.getMainLooper()).post(()->listener.accept(entry));

        String timing=entry.optBoolean("test")?"通知テスト":advance>0?"終了"+advance+"秒前":"時間です";
        String route=routeText(entry);
        Notification notification = new Notification.Builder(context, inApp?CHANNEL+"-in-app":vibration ? CHANNEL : CHANNEL + "-quiet")
            .setSmallIcon(jp.dare.watch.R.drawable.ic_notification).setContentTitle(entry.optString("name"))
            .setContentText(route).setSubText(timing)
            .setStyle(new Notification.BigTextStyle().setBigContentTitle(entry.optString("name")).bigText(route).setSummaryText(timing)).setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setPriority(Notification.PRIORITY_MAX)
            .setContentIntent(open).setAutoCancel(true).build();
        if (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED)
            context.getSystemService(NotificationManager.class).notify(id, 1, notification);
        else if (vibration) vibrate(600);
        // Wear OS can suppress channel vibration while this app is in the foreground.
        if(foreground&&vibration)vibrate(600);
        prefs().edit().putString("lastDelivery",message).putLong("lastDeliveryAt",System.currentTimeMillis()).apply();
        android.util.Log.i("DareTimers","Delivered " + id + " vibration="+vibration+" foreground="+foreground);
    }
}



