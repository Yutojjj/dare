package jp.dare.watch;

import androidx.wear.tiles.TileService;
import androidx.wear.tiles.TileBuilders;
import androidx.wear.tiles.RequestBuilders;
import androidx.wear.tiles.EventBuilders;
import androidx.wear.protolayout.*;
import androidx.wear.protolayout.expression.DynamicBuilders.*;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import java.time.Instant;
import static androidx.wear.protolayout.DimensionBuilders.*;

/** A lightweight glance surface: never starts Gecko or changes shared data. */
public final class WatchTileService extends TileService {
    private WatchRepository repository;
    static void save(android.content.Context context, String raw) {
        android.content.SharedPreferences prefs=context.getSharedPreferences("watch-tile",0);
        if(raw.equals(prefs.getString("state","")))return;
        android.content.SharedPreferences.Editor editor=prefs.edit().putString("state",raw);
        try{JSONObject state=new JSONObject(raw);if(state.has("dayRolloverTime"))editor.putString("rollover",state.getString("dayRolloverTime"));}catch(Exception ignored){}
        editor.apply();
        TileService.getUpdater(context).requestUpdate(WatchTileService.class);
    }
    private JSONObject state(){try{return new JSONObject(getSharedPreferences("watch-tile",0).getString("state","{}"));}catch(Exception e){return new JSONObject();}}
    @Override protected void onTileEnterEvent(EventBuilders.TileEnterEvent event){
        // Refresh only while the tile is visited, rather than keeping a network
        // connection or browser running in the background.
        if(repository!=null)repository.close();
        repository=new WatchRepository(this,(data,status)->{if(data.optInt("version")==2)save(this,data.toString());});
        repository.refresh();
    }
    @Override public void onDestroy(){if(repository!=null)repository.close();super.onDestroy();}
    @Override protected ListenableFuture<ResourceBuilders.Resources> onTileResourcesRequest(RequestBuilders.ResourcesRequest request){return immediate(new ResourceBuilders.Resources.Builder().setVersion("1").build());}
    @Override protected ListenableFuture<TileBuilders.Tile> onTileRequest(RequestBuilders.TileRequest request){
        JSONObject state=state();
        List<JSONObject> casts=WatchTileData.members(state,System.currentTimeMillis(),getSharedPreferences("watch-tile",0).getString("rollover","06:00"));
        LayoutElementBuilders.Column.Builder content=new LayoutElementBuilders.Column.Builder().setWidth(expand());
        content.addContent(text("付け回し",14,0xffeeeeee));
        content.addContent(new LayoutElementBuilders.Spacer.Builder().setHeight(dp(4)).build());
        for(JSONObject cast:casts.subList(0,Math.min(3,casts.size())))content.addContent(member(state,cast));
        if(casts.isEmpty())content.addContent(text("登録メンバーなし",14,0xffcccccc));
        content.addContent(new LayoutElementBuilders.Box.Builder().setWidth(expand()).setHeight(dp(30)).setModifiers(modifiers("",false)).addContent(text(casts.size()>3?"全"+casts.size()+"人を開く":"アプリを開く",12,0xfff4d74e)).build());
        LayoutElementBuilders.Box root=new LayoutElementBuilders.Box.Builder().setWidth(expand()).setHeight(expand())
            .setModifiers(new ModifiersBuilders.Modifiers.Builder().setPadding(new ModifiersBuilders.Padding.Builder().setStart(dp(25)).setEnd(dp(25)).setTop(dp(18)).setBottom(dp(18)).build()).setBackground(new ModifiersBuilders.Background.Builder().setColor(ColorBuilders.argb(0xff0e141b)).build()).build())
            .addContent(content.build()).build();
        return immediate(new TileBuilders.Tile.Builder().setResourcesVersion("1").setFreshnessIntervalMillis(60000)
            .setTileTimeline(new TimelineBuilders.Timeline.Builder().addTimelineEntry(new TimelineBuilders.TimelineEntry.Builder().setLayout(new LayoutElementBuilders.Layout.Builder().setRoot(root).build()).build()).build()).build());
    }
    private LayoutElementBuilders.LayoutElement member(JSONObject state,JSONObject cast){
        String id=cast.optString("id"),name=cast.optString("name");JSONObject timer=WatchModel.timer(state,id);long remaining=WatchModel.remaining(timer);
        String status=timer==null?"未開始":remaining<=0?"終了":timer.optBoolean("paused")?"停止 "+format(remaining):"終了 "+new java.text.SimpleDateFormat("HH:mm",Locale.JAPAN).format(new Date(timer.optLong("endsAt")));
        LayoutElementBuilders.Text.Builder countdown=textBuilder(status,14,remaining>0||timer==null?0xffffffff:0xffff5266);
        if(timer!=null&&!timer.optBoolean("paused")&&remaining>0){
            DynamicInt32 seconds=DynamicInstant.platformTimeWithSecondsPrecision().durationUntil(DynamicInstant.withSecondsPrecision(Instant.ofEpochMilli(timer.optLong("endsAt")))).toIntSeconds();
            DynamicString minutesSeconds=seconds.div(60).format().concat(DynamicString.constant("分")).concat(seconds.rem(60).format()).concat(DynamicString.constant("秒"));
            DynamicString value=DynamicString.onCondition(seconds.gt(0)).use(minutesSeconds).elseUse("終了");
            countdown.setText(new TypeBuilders.StringProp.Builder(status).setDynamicValue(value).build()).setLayoutConstraintsForDynamicText(new TypeBuilders.StringLayoutConstraint.Builder("99分59秒").build());
        }
        String route=WatchModel.name(state,cast.optString("currentTableId"))+" → "+WatchModel.name(state,cast.optString("destinationTableId"));
        LayoutElementBuilders.Column row=new LayoutElementBuilders.Column.Builder().setWidth(expand()).setModifiers(modifiers(id,true))
            .addContent(new LayoutElementBuilders.Row.Builder().setWidth(expand()).setHeight(dp(25)).addContent(new LayoutElementBuilders.Box.Builder().setWidth(expand()).addContent(text(name,14,0xffffffff)).build()).addContent(countdown.build()).build())
            .addContent(text(route,11,0xffbbbbbb)).addContent(new LayoutElementBuilders.Spacer.Builder().setHeight(dp(4)).build()).build();
        return row;
    }
    private ModifiersBuilders.Modifiers modifiers(String id,boolean border){
        ActionBuilders.AndroidActivity activity=new ActionBuilders.AndroidActivity.Builder().setPackageName(getPackageName()).setClassName(WebWatchActivity.class.getName()).addKeyToExtraMapping("castId",new ActionBuilders.AndroidStringExtra.Builder().setValue(id).build()).build();
        ModifiersBuilders.Modifiers.Builder m=new ModifiersBuilders.Modifiers.Builder().setClickable(new ModifiersBuilders.Clickable.Builder().setId(id.isEmpty()?"open":id).setOnClick(new ActionBuilders.LaunchAction.Builder().setAndroidActivity(activity).build()).build());
        if(border)m.setBorder(new ModifiersBuilders.Border.Builder().setWidth(dp(0.5f)).setColor(ColorBuilders.argb(0xff303c48)).build());
        return m.build();
    }
    private static LayoutElementBuilders.Text.Builder textBuilder(String value,float size,int color){return new LayoutElementBuilders.Text.Builder().setText(value).setMaxLines(1).setFontStyle(new LayoutElementBuilders.FontStyle.Builder().setSize(sp(size)).setColor(ColorBuilders.argb(color)).build());}
    private static LayoutElementBuilders.Text text(String value,float size,int color){return textBuilder(value,size,color).build();}
    private static String format(long ms){long s=(ms+999)/1000;return String.format(Locale.ROOT,"%d分%d秒",s/60,s%60);}
    private static <T> ListenableFuture<T> immediate(T value){return new ListenableFuture<T>(){public void addListener(Runnable r,Executor e){e.execute(r);}public boolean cancel(boolean interrupt){return false;}public boolean isCancelled(){return false;}public boolean isDone(){return true;}public T get(){return value;}public T get(long timeout,TimeUnit unit){return value;}};}
}
