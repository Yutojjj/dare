package jp.dare.watch;
import org.json.*;
import java.util.*;

/** Daily performance uses the management app's existing members/dailyMetrics schema. */
final class WatchMetrics {
 static JSONObject member(JSONObject main,String id){JSONArray a=main.optJSONArray("members");if(a!=null)for(int i=0;i<a.length();i++){JSONObject m=a.optJSONObject(i);if(m!=null&&id.equals(m.optString("id")))return m;}return null;}
 static LinkedHashMap<String,String> definitions(JSONObject main){LinkedHashMap<String,String> fields=new LinkedHashMap<>();fields.put("nominations","本指名数");fields.put("freebacks","フリーバック数");JSONArray a=main.optJSONArray("monthlyMetricFields");if(a!=null)for(int i=0;i<a.length();i++){JSONObject f=a.optJSONObject(i);if(f!=null&&f.optString("id").matches("metric_[a-z0-9-]+")&&!f.optString("name").trim().isEmpty())fields.put(f.optString("id"),f.optString("name"));}return fields;}
 static double value(JSONObject main,String id,String date,String field){JSONObject m=member(main,id),days=m==null?null:m.optJSONObject("dailyMetrics"),daily=days==null?null:days.optJSONObject(date);double value=daily==null?0:daily.optDouble(field,0);return Double.isFinite(value)?Math.max(0,value):0;}
 static String number(double v){return v==Math.floor(v)?Long.toString((long)v):Double.toString(v);}
 static void apply(JSONObject main,String id,String date,Map<String,Double> deltas)throws Exception{
  JSONObject m=member(main,id);if(m==null)throw new IllegalArgumentException("キャストが見つかりません");
  Set<String> valid=definitions(main).keySet();for(String field:deltas.keySet())if(!valid.contains(field))throw new IllegalArgumentException("項目が変更されています。開き直してください");
  JSONObject daily=WatchRepository.object(WatchRepository.object(m,"dailyMetrics"),date);
  for(Map.Entry<String,Double> item:deltas.entrySet()){double next=Math.max(0,value(main,id,date,item.getKey())+item.getValue());if(!Double.isFinite(next))throw new IllegalArgumentException("数値を確認してください");daily.put(item.getKey(),number(next));}
 }
}
