package jp.dare.watch;

import android.content.Context;
import android.graphics.*;
import android.view.*;
import org.json.JSONObject;
import java.util.*;

/** Native foreground alarm surface, independent of the browser's lifecycle. */
final class TimerNoticeView extends View {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final ArrayDeque<JSONObject> queue=new ArrayDeque<>();
    private JSONObject current;
    TimerNoticeView(Context context){super(context);setVisibility(GONE);setContentDescription("タイマー通知。右にスワイプして戻る");}
    void show(JSONObject entry){
        if(current==null||current.optString("castId").equals(entry.optString("castId")))current=entry;else queue.addLast(entry);
        setVisibility(VISIBLE);invalidate();
    }
    boolean showing(){return current!=null;}
    void dismiss(){current=queue.pollFirst();setVisibility(current==null?GONE:VISIBLE);invalidate();}
    @Override public boolean onTouchEvent(MotionEvent event){return true;}
    @Override protected void onDraw(Canvas canvas){
        if(current==null)return;
        canvas.drawColor(Color.BLACK);canvas.save();
        float scale=Math.min(getWidth(),getHeight())/396f;
        canvas.translate((getWidth()-396*scale)/2,(getHeight()-396*scale)/2);canvas.scale(scale,scale);
        paint.setStyle(Paint.Style.FILL);paint.setColor(Color.rgb(81,120,158));canvas.drawCircle(198,48,21,paint);
        paint.setColor(Color.WHITE);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(2);canvas.drawCircle(198,48,11,paint);canvas.drawLine(198,40,198,48,paint);canvas.drawLine(198,48,204,52,paint);paint.setStyle(Paint.Style.FILL);
        line(canvas,current.optString("name"),105,28,Color.WHITE,280);
        int advance=current.optInt("advance");
        line(canvas,current.optBoolean("test")?"通知テスト":advance>0?"終了"+advance+"秒前":"時間です",134,15,0xffb0b8c3,280);
        line(canvas,new java.text.SimpleDateFormat("HH:mm",Locale.JAPAN).format(new Date()),156,14,0xffb0b8c3,280);
        line(canvas,current.optString("fromTableName","未設定"),213,29,Color.WHITE,310);
        line(canvas,"↓",250,28,Color.WHITE,310);
        line(canvas,current.optString("toTableName","未設定"),289,29,Color.WHITE,310);
        canvas.restore();
    }
    private void line(Canvas canvas,String text,float y,float size,int color,float width){
        paint.setColor(color);paint.setTypeface(Typeface.DEFAULT);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(size);
        while(paint.measureText(text)>width&&size>12)paint.setTextSize(--size);
        canvas.drawText(text,198,y,paint);
    }
}
