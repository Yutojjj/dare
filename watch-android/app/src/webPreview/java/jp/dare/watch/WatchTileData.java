package jp.dare.watch;

import org.json.*;
import java.util.*;

/** Pure data selection; the tile never rolls over or writes the shared roster. */
final class WatchTileData {
    static List<JSONObject> members(JSONObject state,long now,String rollover){
        Calendar calendar=Calendar.getInstance();calendar.setTimeInMillis(now);
        int hour=6,minute=0;
        try{String[] parts=rollover.split(":");hour=Integer.parseInt(parts[0]);minute=Integer.parseInt(parts[1]);}catch(Exception ignored){}
        if(calendar.get(Calendar.HOUR_OF_DAY)*60+calendar.get(Calendar.MINUTE)<hour*60+minute)calendar.add(Calendar.DATE,-1);
        String day=new java.text.SimpleDateFormat("yyyy-MM-dd",Locale.JAPAN).format(calendar.getTime());
        ArrayList<JSONObject> result=new ArrayList<>();JSONArray all=state.optJSONArray("casts");
        if(all!=null)for(int i=0;i<all.length();i++){JSONObject cast=all.optJSONObject(i);if(cast!=null&&(!cast.optBoolean("dayAdded")||day.equals(cast.optString("dayAddedOn"))))result.add(cast);}
        result.sort(Comparator.comparingLong(c->{JSONObject t=WatchModel.timer(state,c.optString("id"));return t==null?Long.MAX_VALUE:remaining(t,now);}));
        return result;
    }
    static long remaining(JSONObject timer,long now){return timer==null?0:Math.max(0,timer.optBoolean("paused")?timer.optLong("pausedRemainingMs"):timer.optLong("endsAt")-now);}
}
