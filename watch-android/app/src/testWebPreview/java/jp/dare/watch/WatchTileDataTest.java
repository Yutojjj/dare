package jp.dare.watch;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
import java.time.*;
import java.util.*;

public class WatchTileDataTest {
    @Test public void remainingUsesDeadlineAndKeepsPausedValue() throws Exception {
        assertEquals(5000,WatchTileData.remaining(new JSONObject("{endsAt:15000}"),10000));
        assertEquals(0,WatchTileData.remaining(new JSONObject("{endsAt:5000}"),10000));
        assertEquals(4000,WatchTileData.remaining(new JSONObject("{paused:true,pausedRemainingMs:4000,endsAt:5000}"),10000));
    }
    @Test public void rolloverFiltersWithoutRemovingHistoryOrChangingSharedData() throws Exception {
        TimeZone prior=TimeZone.getDefault();TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"));
        try{
            JSONObject state=new JSONObject("{casts:[{id:old,dayAdded:true,dayAddedOn:'2026-10-30'},{id:today,dayAdded:true,dayAddedOn:'2026-10-31'}],timers:{}}");
            String original=state.toString();
            long before=ZonedDateTime.of(2026,10,31,5,59,0,0,ZoneId.of("Asia/Tokyo")).toInstant().toEpochMilli();
            assertEquals("old",WatchTileData.members(state,before,"06:00").get(0).getString("id"));
            assertEquals("today",WatchTileData.members(state,before+60000,"06:00").get(0).getString("id"));
            assertEquals(original,state.toString());
        }finally{TimeZone.setDefault(prior);}
    }
    @Test public void shortestTimerFirstAndUnstartedLast() throws Exception {
        JSONObject state=new JSONObject("{casts:[{id:none},{id:long},{id:short}],timers:{long:{endsAt:20000},short:{endsAt:15000}}}");
        List<JSONObject> ordered=WatchTileData.members(state,10000,"06:00");
        assertEquals("short",ordered.get(0).getString("id"));assertEquals("long",ordered.get(1).getString("id"));assertEquals("none",ordered.get(2).getString("id"));
    }
}
