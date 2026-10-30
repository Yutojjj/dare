package jp.dare.watch;
import org.json.*;
/** Runs against Android's real JSON/runtime through adb app_process; never writes shared state. */
public final class NativeChecks {
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 public static void main(String[] args)throws Exception{
  JSONObject sample=new JSONObject("{\"n\":1234567890123,\"ratio\":1.5,\"b\":true,\"a\":[null,\"卓\",{\"id\":\"1\"}]}");
  JSONObject decoded=(JSONObject)WatchRepository.decode(WatchRepository.encode(sample));check(decoded.getLong("n")==1234567890123L&&decoded.getDouble("ratio")==1.5&&decoded.getJSONArray("a").isNull(0),"Firestore codec");
  JSONObject s=new JSONObject("{\"version\":2,\"floors\":[{\"id\":\"f\",\"name\":\"1階\",\"tables\":[{\"id\":\"t1\",\"name\":\"1卓\"},{\"id\":\"t2\",\"name\":\"2卓\"}]}],\"casts\":[{\"id\":\"c\",\"name\":\"確認用\",\"currentTableId\":\"t1\",\"destinationTableId\":\"t2\",\"nominatedTableIds\":[\"t1\",\"t2\"]}],\"timers\":{}}");
  check(WatchModel.fullTableName(s,"t1").equals("1階・1卓"),"floor and table label");WatchModel.selectTime(s,"c",300000,true);check(WatchModel.timer(s,"c").getBoolean("paused"),"preset must not start");
  WatchModel.adjust(s,"c",10000);check(WatchModel.remaining(WatchModel.timer(s,"c"))==310000,"adjust seconds");check(WatchModel.cast(s,"c").getJSONArray("timerHistory").length()==1,"adjust must not add history");
  WatchModel.toggle(s,"c");check(!WatchModel.timer(s,"c").getBoolean("paused"),"start");WatchModel.toggle(s,"c");check(WatchModel.timer(s,"c").getBoolean("paused"),"pause");
  WatchModel.selectTime(s,"c",420000,true);WatchModel.move(s,"c");check(WatchModel.cast(s,"c").getString("currentTableId").equals("t2"),"move order");check(WatchModel.remaining(WatchModel.timer(s,"c"))==420000&&WatchModel.timer(s,"c").getBoolean("paused"),"move resets paused duration");
  WatchModel.selectTime(s,"c",120000,true);WatchModel.move(s,"c");check(WatchModel.remaining(WatchModel.timer(s,"c"))==420000,"remember duration per table");WatchModel.undo(s,"c");check(WatchModel.cast(s,"c").getString("currentTableId").equals("t2"),"undo");check(WatchModel.remaining(WatchModel.timer(s,"c"))==120000&&WatchModel.timer(s,"c").optBoolean("paused"),"undo restores previous timer");
  JSONObject cast=WatchModel.cast(s,"c");cast.put("dayAdded",true).put("dayAddedOn","2000-01-01");check(WatchModel.expired(s),"business day");WatchModel.rollover(s);check(s.getJSONArray("casts").length()==0&&s.getJSONArray("dayMemberHistory").length()==1,"archive before removal");
  JSONObject main=new JSONObject("{\"members\":[{\"id\":\"c\",\"name\":\"確認用\",\"months\":{\"2026-10\":{\"keep\":\"yes\"}},\"dailyMetrics\":{\"2026-10-29\":{\"nominations\":\"8\"},\"2026-10-30\":{\"nominations\":\"3\",\"freebacks\":\"1\",\"metric_test\":\"2\",\"other\":\"keep\"}}}],\"monthlyMetricFields\":[{\"id\":\"metric_test\",\"name\":\"追加項目\"}]}");
  check(WatchMetrics.definitions(main).size()==3,"custom metric definitions");java.util.LinkedHashMap<String,Double> changes=new java.util.LinkedHashMap<>();changes.put("nominations",2.0);changes.put("freebacks",-5.0);changes.put("metric_test",1.0);WatchMetrics.apply(main,"c","2026-10-30",changes);
  check(WatchMetrics.value(main,"c","2026-10-30","nominations")==5&&WatchMetrics.value(main,"c","2026-10-30","freebacks")==0&&WatchMetrics.value(main,"c","2026-10-30","metric_test")==3,"daily steppers and minimum zero");
  check(WatchMetrics.value(main,"c","2026-10-29","nominations")==8&&WatchMetrics.member(main,"c").getJSONObject("months").getJSONObject("2026-10").getString("keep").equals("yes"),"preserve other days and months");
  check(WatchMetrics.member(main,"c").getJSONObject("dailyMetrics").getJSONObject("2026-10-30").getString("other").equals("keep"),"preserve unrelated daily values");
  changes.clear();changes.put("nominations",1.0);WatchMetrics.apply(main,"c","2026-10-30",changes);check(WatchMetrics.value(main,"c","2026-10-30","nominations")==6,"merge increments against latest value");
  boolean rejected=false;try{WatchMetrics.apply(main,"missing","2026-10-30",changes);}catch(IllegalArgumentException expected){rejected=true;}check(rejected,"missing member must not create data");
  check(NativeTimers.routeText(new JSONObject().put("fromTableName","1階・1卓").put("toTableName","2階・8卓")).equals("1階・1卓\n↓\n2階・8卓"),"notification route text");
  check(NativeTimers.routeText(new JSONObject().put("fromTableName","1階・1卓")).contains("次の卓は未設定"),"notification missing destination");
  System.out.println("PASS: daily metrics, custom fields, preserving data, merging increments, codec, preset, start/pause, adjustments, table duration, route, undo, daily archive (no shared data changed)");
 }
}




