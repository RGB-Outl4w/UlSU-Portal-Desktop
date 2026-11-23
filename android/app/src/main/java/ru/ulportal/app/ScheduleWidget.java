package ru.ulportal.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.text.format.DateFormat;
import android.util.AtomicFile;
import android.widget.RemoteViews;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class ScheduleWidget extends AppWidgetProvider {
    private static final String FILE_NAME = "widget-schedule.json";
    private static final String ROLLOVER = "ru.ulportal.app.widget.ROLLOVER";
    private static final int MAX_LESSONS = 160;
    private static long generation;

    record Lesson(long start, String subject, String place) {}

    static Lesson nextLesson(List<Lesson> lessons, long now, long expiresAt) {
        Lesson next = null;
        for (Lesson lesson : lessons) {
            if (lesson.start() > now && lesson.start() < expiresAt && (next == null || lesson.start() < next.start())) {
                next = lesson;
            }
        }
        return next;
    }

    private static AtomicFile snapshotFile(Context ctx) {
        return new AtomicFile(new File(ctx.getNoBackupFilesDir(), FILE_NAME));
    }

    static synchronized long generation() {
        return generation;
    }

    static synchronized void save(Context ctx, JSONObject snapshot) throws IOException, JSONException {
        if (snapshot.getLong("generation") != generation) return;
        long now = System.currentTimeMillis();
        long expiresAt = snapshot.getLong("expiresAt");
        JSONArray input = snapshot.getJSONArray("lessons");
        if (input.length() > MAX_LESSONS || expiresAt > now + TimeUnit.DAYS.toMillis(21)) {
            throw new JSONException("Timetable outside the supported window");
        }
        if (expiresAt <= now) {
            snapshotFile(ctx).delete();
            refresh(ctx);
            return;
        }
        JSONArray lessons = new JSONArray();
        for (int i = 0; i < input.length(); i++) {
            JSONObject row = input.optJSONObject(i);
            if (row == null) continue;
            long start = row.optLong("start");
            String subject = row.optString("subject").trim();
            String place = row.optString("place").trim();
            if (start > 0 && start < expiresAt && !subject.isEmpty() && subject.length() <= 160 && place.length() <= 100) {
                lessons.put(new JSONObject().put("start", start).put("subject", subject).put("place", place));
            }
        }
        byte[] data = new JSONObject().put("expiresAt", expiresAt).put("lessons", lessons).toString().getBytes(StandardCharsets.UTF_8);
        AtomicFile file = snapshotFile(ctx);
        FileOutputStream out = file.startWrite();
        try {
            out.write(data);
            file.finishWrite(out);
        } catch (IOException error) {
            file.failWrite(out);
            throw error;
        }
        refresh(ctx);
    }

    static synchronized void clear(Context ctx) {
        generation++;
        snapshotFile(ctx).delete();
        refresh(ctx);
    }

    private static JSONObject readSnapshot(Context ctx) {
        try {
            return new JSONObject(new String(snapshotFile(ctx).readFully(), StandardCharsets.UTF_8));
        } catch (IOException | JSONException ignored) {
            return new JSONObject();
        }
    }

    private static synchronized void update(Context ctx, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;
        Locale locale = Locale.forLanguageTag(PortalCheck.t(ctx, "ru", "en"));
        Configuration config = new Configuration(ctx.getResources().getConfiguration());
        config.setLocale(locale);
        Resources strings = ctx.createConfigurationContext(config).getResources();
        JSONObject snapshot = readSnapshot(ctx);
        long now = System.currentTimeMillis();
        long expiresAt = snapshot.optLong("expiresAt");
        JSONArray rows = snapshot.optJSONArray("lessons");
        List<Lesson> lessons = new ArrayList<>();
        if (expiresAt > now && rows != null) {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null) lessons.add(new Lesson(row.optLong("start"), row.optString("subject"), row.optString("place")));
            }
        }
        Lesson next = nextLesson(lessons, now, expiresAt);
        String subject, detail;
        if (next == null) {
            subject = strings.getString(expiresAt > now ? R.string.widget_no_classes : R.string.widget_open_schedule);
            detail = strings.getString(expiresAt > now ? R.string.widget_open_schedule : R.string.widget_load_schedule);
        } else {
            subject = next.subject();
            String pattern = DateFormat.getBestDateTimePattern(locale, DateFormat.is24HourFormat(ctx) ? "EEEddMMHHmm" : "EEEddMMhmm");
            detail = new SimpleDateFormat(pattern, locale).format(new Date(next.start()));
            if (!next.place().isEmpty()) detail += " · " + next.place();
        }
        Intent open = new Intent(ctx, MainActivity.class).putExtra("view", "schedule").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 300, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteViews card = new RemoteViews(ctx.getPackageName(), R.layout.widget_schedule);
        card.setTextViewText(R.id.widget_label, strings.getString(R.string.widget_next_class));
        card.setTextViewText(R.id.widget_subject, subject);
        card.setTextViewText(R.id.widget_detail, detail);
        card.setOnClickPendingIntent(android.R.id.background, tap);
        manager.updateAppWidget(ids, card);
        long nextUpdate = next == null ? expiresAt : next.start();
        AlarmManager alarms = ctx.getSystemService(AlarmManager.class);
        PendingIntent alarm = rollover(ctx);
        // Best effort at the displayed class's start, with the launcher's periodic update as a fallback.
        if (nextUpdate > now) alarms.set(AlarmManager.RTC, nextUpdate, alarm);
        else alarms.cancel(alarm);
    }

    static void refresh(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, ScheduleWidget.class));
        update(ctx, manager, ids);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        update(ctx, manager, ids);
    }

    private static PendingIntent rollover(Context ctx) {
        Intent tick = new Intent(ctx, ScheduleWidget.class).setAction(ROLLOVER);
        return PendingIntent.getBroadcast(ctx, 0, tick, PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (ROLLOVER.equals(intent.getAction())) refresh(ctx);
        else super.onReceive(ctx, intent);
    }

    @Override
    public void onDisabled(Context ctx) {
        ctx.getSystemService(AlarmManager.class).cancel(rollover(ctx));
    }
}
