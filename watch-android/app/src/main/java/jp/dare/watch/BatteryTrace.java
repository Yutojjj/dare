package jp.dare.watch;

import android.content.*;
import android.os.BatteryManager;
import org.json.*;

/** Passive samples at existing events. Never wakes or polls the watch. */
final class BatteryTrace {
    static synchronized void record(Context context,String event){
        try{
            Intent battery=context.registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if(battery==null)return;
            int scale=battery.getIntExtra(BatteryManager.EXTRA_SCALE,100),level=battery.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);
            if(level<0||scale<=0)return;
            int percent=level*100/scale,plugged=battery.getIntExtra(BatteryManager.EXTRA_PLUGGED,0);
            android.content.SharedPreferences prefs=context.getSharedPreferences("watch-battery-trace",0);
            long now=System.currentTimeMillis();
            if(prefs.getInt("level",-1)==percent&&prefs.getInt("plugged",-1)==plugged&&now-prefs.getLong("at",0)<600000)return;
            JSONArray history=new JSONArray(prefs.getString("samples","[]"));
            history.put(new JSONObject().put("at",now).put("percent",percent).put("plugged",plugged).put("temperature",battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,0)).put("event",event));
            JSONArray recent=new JSONArray();for(int i=Math.max(0,history.length()-240);i<history.length();i++)recent.put(history.get(i));
            prefs.edit().putString("samples",recent.toString()).putInt("level",percent).putInt("plugged",plugged).putLong("at",now).apply();
        }catch(Exception error){android.util.Log.w("DareBattery","Sample unavailable",error);}
    }
}
