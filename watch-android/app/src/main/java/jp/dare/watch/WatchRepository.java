package jp.dare.watch;

import org.json.*;
import java.net.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import android.os.*;

/** Firestore wire codec and serialized, conditional shared-document updates. No UI dependencies. */
final class WatchRepository {
    interface Change { void apply(JSONObject state) throws Exception; }
    interface Listener { void changed(JSONObject state, String status); }
    private static final String BASE="https://firestore.googleapis.com/v1/projects/dare-78df9/databases/(default)/documents/shared/";
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Listener listener;
    private final android.content.SharedPreferences prefs;
    volatile JSONObject state=new JSONObject();
    volatile JSONObject members=new JSONObject();
    private boolean closed;
    private final java.util.concurrent.atomic.AtomicBoolean refreshing=new java.util.concurrent.atomic.AtomicBoolean();
    WatchRepository(android.content.Context context, Listener listener) {
        this.listener=listener; prefs=context.getSharedPreferences("watch-native",0);
        try { state=new JSONObject(prefs.getString("state","{}")); } catch(Exception ignored){}
    }
    private JSONObject request(String method,String path,JSONObject body) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+path).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(12000); c.setReadTimeout(12000);
        try {
            if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
            int code=c.getResponseCode(); InputStream in=code<400?c.getInputStream():c.getErrorStream();
            String raw=in==null?"":new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            if(code>=400) throw new IOException("HTTP "+code+" "+raw);
            return new JSONObject(raw);
        } finally {c.disconnect();}
    }
    static JSONObject object(JSONObject o,String key) throws JSONException {JSONObject v=o.optJSONObject(key);if(v==null){v=new JSONObject();o.put(key,v);}return v;}
    static JSONArray array(JSONObject o,String key) throws JSONException {JSONArray v=o.optJSONArray(key);if(v==null){v=new JSONArray();o.put(key,v);}return v;}
    static JSONObject encode(Object v) throws JSONException {
        JSONObject r=new JSONObject();
        if(v==null||v==JSONObject.NULL)return r.put("nullValue",JSONObject.NULL);
        if(v instanceof JSONObject){JSONObject fields=new JSONObject();Iterator<String> keys=((JSONObject)v).keys();while(keys.hasNext()){String k=keys.next();fields.put(k,encode(((JSONObject)v).get(k)));}return r.put("mapValue",new JSONObject().put("fields",fields));}
        if(v instanceof JSONArray){JSONArray a=new JSONArray();for(int i=0;i<((JSONArray)v).length();i++)a.put(encode(((JSONArray)v).get(i)));return r.put("arrayValue",new JSONObject().put("values",a));}
        if(v instanceof Boolean)return r.put("booleanValue",v);
        if(v instanceof Float||v instanceof Double)return r.put("doubleValue",v);
        if(v instanceof Number)return r.put("integerValue",v.toString());
        return r.put("stringValue",v.toString());
    }
    static Object decode(JSONObject v) throws JSONException {
        if(v.has("mapValue")){JSONObject f=v.getJSONObject("mapValue").optJSONObject("fields"),r=new JSONObject();if(f!=null){Iterator<String> it=f.keys();while(it.hasNext()){String k=it.next();r.put(k,decode(f.getJSONObject(k)));}}return r;}
        if(v.has("arrayValue")){JSONArray a=v.getJSONObject("arrayValue").optJSONArray("values"),r=new JSONArray();if(a!=null)for(int i=0;i<a.length();i++)r.put(decode(a.getJSONObject(i)));return r;}
        if(v.has("integerValue"))return Long.parseLong(v.getString("integerValue"));
        if(v.has("doubleValue"))return v.getDouble("doubleValue");
        if(v.has("booleanValue"))return v.getBoolean("booleanValue");
        if(v.has("nullValue"))return JSONObject.NULL;
        return v.optString("stringValue",v.optString("timestampValue",""));
    }
    static JSONObject documentState(JSONObject doc)throws JSONException{return (JSONObject)decode(doc.getJSONObject("fields").getJSONObject("state"));}
    private void publish(JSONObject next,String status){state=next;prefs.edit().putString("state",next.toString()).apply();main.post(()->{if(!closed)listener.changed(state,status);});}
    void refresh(){if(!refreshing.compareAndSet(false,true))return;worker.execute(()->{try{JSONObject next=documentState(request("GET","watch",null));if(next.optInt("version")!=2)throw new IOException("データ形式が異なります");publish(next,"共有中");}catch(Exception e){main.post(()->{if(!closed)listener.changed(state,"接続待ち・操作は再接続後");});}finally{refreshing.set(false);}});}
    void loadMembers(Runnable done){worker.execute(()->{try{members=documentState(request("GET","main",null));}catch(Exception ignored){}main.post(done);});}
    void loadMetrics(java.util.function.Consumer<String> done){worker.execute(()->{String error=null;try{members=documentState(request("GET","main",null));}catch(Exception e){error="実績を読み込めませんでした。通信を確認してください";}final String result=error;main.post(()->{if(!closed)done.accept(result);});});}
    void saveMetrics(String id,String date,Map<String,Double> deltas,java.util.function.Consumer<String> done){worker.execute(()->{
        String error=null;
        try{boolean saved=false;for(int attempt=0;attempt<3;attempt++){
            JSONObject doc=request("GET","main",null),next=documentState(doc);
            WatchMetrics.apply(next,id,date,deltas);
            String path="main?updateMask.fieldPaths=state&currentDocument.updateTime="+URLEncoder.encode(doc.getString("updateTime"),"UTF-8");
            try{request("PATCH",path,new JSONObject().put("fields",new JSONObject().put("state",encode(next))));members=next;saved=true;break;}
            catch(IOException e){if(attempt==2||(!e.getMessage().contains("HTTP 409")&&!e.getMessage().contains("FAILED_PRECONDITION")))throw e;}
        }if(!saved)throw new IOException("保存が競合しました");}
        catch(Exception e){error=e instanceof IllegalArgumentException?e.getMessage():"保存できませんでした。通信を確認して再試行してください";}
        final String result=error;main.post(()->{if(!closed)done.accept(result);});
    });}
    void change(Change change){change(change,null);}
    void change(Change change,java.util.function.Consumer<String> done){worker.execute(()->{
        try {for(int attempt=0;attempt<3;attempt++){
            JSONObject doc=request("GET","watch",null),next=documentState(doc);
            if(next.optInt("version")!=2)throw new IOException("共有データ未作成");
            change.apply(next);
            JSONObject fields=new JSONObject().put("state",encode(next));
            String path="watch?updateMask.fieldPaths=state&currentDocument.updateTime="+URLEncoder.encode(doc.getString("updateTime"),"UTF-8");
            try{request("PATCH",path,new JSONObject().put("fields",fields));publish(next,"共有中");if(done!=null)main.post(()->{if(!closed)done.accept(null);});return;}
            catch(IOException e){if(!e.getMessage().contains("HTTP 409")&&!e.getMessage().contains("HTTP 400"))throw e;if(attempt==2)throw e;}
        }}catch(Exception e){String message=e instanceof IllegalArgumentException?e.getMessage():"保存できませんでした。再操作してください";main.post(()->{if(!closed){listener.changed(state,message);if(done!=null)done.accept(message);}});}
    });}
    void close(){closed=true;worker.shutdownNow();}
}
