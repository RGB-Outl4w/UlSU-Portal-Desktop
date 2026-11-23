package ru.ulportal.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import androidx.core.app.NotificationManagerCompat;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

final class PortalAlerts {
    static final long DAY = 86400;
    private static final int DEADLINES = -101, GRADES = -102;
    private static final Object LOCK = new Object();
    private static long checkedUser, gradeCheckedAt;

    // Same scoped overview selector and grade normalization as alerts.js.
    private static final Pattern TABLE = Pattern.compile(
            "<table\\b(?=[^>]*\\bid\\s*=\\s*(['\"])overview-grade\\1)[^>]*>(.*?)</table\\s*>",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern ROW = Pattern.compile("<tr\\b[^>]*>(.*?)</tr\\s*>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CELL = Pattern.compile("<td\\b[^>]*>(.*?)</td\\s*>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern COURSE_LINK = Pattern.compile(
            "\\bhref\\s*=\\s*(['\"])((?:https://portal\\.ulsu\\.ru)?/(?:course/user|grade/report/user/index)\\.php\\?[^'\"]+)\\1",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern COURSE_ID = Pattern.compile("[?&]id=(\\d+)(?=&|$)");
    private static final Pattern EMBEDDED = Pattern.compile("<(?:script|style|svg|iframe|object)\\b", Pattern.CASE_INSENSITIVE);

    private PortalAlerts() {}

    static Map<String, String> courseGrades(String html) {
        Matcher table = TABLE.matcher(html);
        if (!table.find()) return null;
        Matcher rows = ROW.matcher(table.group(2));
        Map<String, String> grades = new HashMap<>();
        boolean hasRows = false;
        while (rows.find()) {
            Matcher cells = CELL.matcher(rows.group(1));
            if (!cells.find()) continue;
            Matcher link = COURSE_LINK.matcher(cells.group(1));
            if (!cells.find()) continue;
            hasRows = true;
            if (!link.find()) continue;
            Matcher id = COURSE_ID.matcher(link.group(2).replaceAll("(?i)&amp;", "&"));
            if (!id.find()) continue;
            String cell = cells.group(1);
            if (EMBEDDED.matcher(cell).find()) continue;
            String mark = cell.replaceAll("<[^>]*>", "").replaceAll("(?i)&nbsp;|&#160;|&#xa0;", " ")
                    .replaceAll("(?i)&[nm]dash;", "—").replaceAll("[\\s\\p{Zs}]+", " ").trim();
            if (mark.matches("(?iu)(?:[-–—]|Ошибка|Error)?")) {
                grades.put(id.group(1), "");
            } else if (mark.length() <= 80) {
                grades.put(id.group(1), mark.replaceAll("(\\d+)[.,](\\d*?[1-9])0*(?!\\d)", "$1.$2")
                        .replaceAll("(\\d+)[.,]0+(?!\\d)", "$1").replaceAll("\\s+%", "%"));
            }
        }
        return !grades.isEmpty() || !hasRows ? grades : null;
    }

    static int changedGrades(Map<String, String> previous, Map<String, String> current) {
        int count = 0;
        for (Map.Entry<String, String> row : current.entrySet()) {
            if (previous.containsKey(row.getKey()) && !Objects.equals(previous.get(row.getKey()), row.getValue())) count++;
        }
        return count;
    }

    static String deadlineKey(String id, long due, long now, boolean actionable) {
        return actionable && id.matches("\\d+") && due > now && due <= now + DAY ? id + ":" + due : null;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("alerts", Context.MODE_PRIVATE);
    }

    static void reset(Context ctx) {
        synchronized (LOCK) {
            prefs(ctx).edit().clear().apply();
            checkedUser = 0;
            gradeCheckedAt = 0;
            NotificationManagerCompat notifications = NotificationManagerCompat.from(ctx);
            notifications.cancel(DEADLINES);
            notifications.cancel(GRADES);
        }
    }

    private static boolean enabled(Context ctx, String name) {
        return "on".equals(PortalCheck.webPrefs(ctx).optString(name));
    }

    private static boolean canNotify(Context ctx) {
        NotificationChannel channel = ctx.getSystemService(NotificationManager.class).getNotificationChannel(PortalCheck.CHANNEL);
        return (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE) &&
                NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    static void check(Context ctx, long user, String key, long started) {
        JSONObject settings = PortalCheck.webPrefs(ctx);
        boolean reminders = "on".equals(settings.optString("deadlineReminders"));
        boolean grades = "on".equals(settings.optString("gradeAlerts"));
        if (!reminders && !grades) return;
        if (!PortalCheck.current(started) || !canNotify(ctx)) return;
        SharedPreferences prefs = prefs(ctx);
        synchronized (LOCK) {
            if (!PortalCheck.current(started)) return;
            if (prefs.getLong("account", 0) != user) {
                prefs.edit().clear().putLong("account", user).apply();
                NotificationManagerCompat notifications = NotificationManagerCompat.from(ctx);
                notifications.cancel(DEADLINES);
                notifications.cancel(GRADES);
            }
        }
        if (reminders) {
            try { checkDeadlines(ctx, prefs, key, started); } catch (Exception ignored) {
                // A failed reminder check leaves the last successful state in place.
            }
        }
        if (!grades) return;
        synchronized (LOCK) {
            if (!PortalCheck.current(started)) return;
            long now = android.os.SystemClock.elapsedRealtime();
            if (checkedUser == user && now - gradeCheckedAt < 15 * 60_000) return;
            checkedUser = user;
            gradeCheckedAt = now;
        }
        try { checkGrades(ctx, prefs, key, started); } catch (Exception ignored) {
            // Retry on the next grade check without losing the baseline.
        }
    }

    private static void checkDeadlines(Context ctx, SharedPreferences prefs, String key, long started) throws Exception {
        long from = System.currentTimeMillis() / 1000;
        JSONObject args = new JSONObject().put("timesortfrom", from).put("timesortto", from + DAY)
                .put("limitnum", 50).put("limittononsuspendedevents", true);
        JSONArray calls = new JSONArray().put(PortalCheck.call(0, "core_calendar_get_action_events_by_timesort", args));
        PortalCheck.Http response = PortalCheck.http(PortalCheck.BASE + "/lib/ajax/service.php?sesskey=" + key + "&info=deadlines", calls.toString(), started);
        if (response.status != 200) return;
        JSONArray events = new JSONArray(response.body).getJSONObject(0).getJSONObject("data").getJSONArray("events");
        synchronized (LOCK) {
            if (!PortalCheck.current(started) || !enabled(ctx, "deadlineReminders") || !canNotify(ctx)) return;
            JSONObject previous = new JSONObject(prefs.getString("sent", "{}"));
            JSONObject sent = new JSONObject();
            long now = System.currentTimeMillis() / 1000;
            for (Iterator<String> keys = previous.keys(); keys.hasNext();) {
                String id = keys.next();
                if (previous.optLong(id) > now) sent.put(id, previous.optLong(id));
            }
            int count = 0;
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.optJSONObject(i);
                if (event == null) continue;
                long due = event.optLong("timesort");
                JSONObject action = event.optJSONObject("action");
                String id = deadlineKey(event.optString("id"), due, now, action == null || action.optBoolean("actionable", true));
                if (id == null || sent.has(id)) continue;
                sent.put(id, due);
                count++;
            }
            if ((count == 0 && sent.length() == previous.length()) || !prefs.edit().putString("sent", sent.toString()).commit()) return;
            if (count > 0) PortalCheck.notify(ctx, DEADLINES, PortalCheck.t(ctx, "Приближаются дедлайны", "Upcoming deadlines"),
                    PortalCheck.t(ctx, "Дедлайнов в ближайшие 24 ч: ", "Deadlines in the next 24 hours: ") + count + ".", "deadlines");
        }
    }

    private static void checkGrades(Context ctx, SharedPreferences prefs, String key, long started) throws Exception {
        PortalCheck.Http response = PortalCheck.http(PortalCheck.BASE + "/grade/report/overview/index.php", null, started);
        if (response.status != 200 || !key.equals(PortalCheck.find(response.body, "\"sesskey\":\"(\\w+)\""))) return;
        Map<String, String> fresh = courseGrades(response.body);
        if (fresh == null || fresh.isEmpty()) return;
        synchronized (LOCK) {
            if (!PortalCheck.current(started) || !enabled(ctx, "gradeAlerts") || !canNotify(ctx)) return;
            JSONObject stored = new JSONObject(prefs.getString("grades", "{}"));
            Map<String, String> previous = new HashMap<>();
            for (Iterator<String> ids = stored.keys(); ids.hasNext();) {
                String id = ids.next();
                previous.put(id, stored.optString(id));
            }
            int count = changedGrades(previous, fresh);
            if (previous.entrySet().containsAll(fresh.entrySet())) return;
            previous.putAll(fresh);
            if (!prefs.edit().putString("grades", new JSONObject(previous).toString()).commit()) return;
            if (count > 0) PortalCheck.notify(ctx, GRADES, PortalCheck.t(ctx, "Обновились оценки", "Grades updated"),
                    PortalCheck.t(ctx, "Курсов с изменениями оценок: ", "Courses with grade changes: ") + count + ".", "grades");
        }
    }
}
