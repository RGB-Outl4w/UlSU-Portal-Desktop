package ru.ulportal.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.text.Html;
import android.webkit.CookieManager;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

// Unread check, the Android version of main.js poll(): counts for the badges, a notification for each new
// notification/message, one for a session that ended. It doubles as the keepalive that stops Moodle's idle
// timeout. Runs from the app every few minutes (portal.poll) and from WorkManager every 15 min in the background.
// Never signs in: a dead session is only reported; the next view load in the app asks to sign in.
public class PortalCheck {
    static final String BASE = UlPortalPlugin.BASE;
    static final String CHANNEL = "portal";

    // Background run; Android may stretch the 15 min (Doze), so the keepalive is best-effort.
    public static class Job extends Worker {
        public Job(@NonNull Context ctx, @NonNull WorkerParameters params) {
            super(ctx, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                check(getApplicationContext());
            } catch (Exception ignored) {
                // offline; keep everything and retry next run
            }
            return Result.success();
        }
    }

    static void schedule(Context ctx) {
        Constraints online = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest job = new PeriodicWorkRequest.Builder(Job.class, 15, TimeUnit.MINUTES).setConstraints(online).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("poll", ExistingPeriodicWorkPolicy.KEEP, job);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("poll", Context.MODE_PRIVATE);
    }

    // Logout: forget the session, and don't report its end.
    static void reset(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }

    // Returns { session: ok|expired|maintenance, notifications, messages } (counts only when ok).
    static synchronized JSObject check(Context ctx) throws Exception {
        SharedPreferences p = prefs(ctx);
        String sesskey = p.getString("sesskey", null);
        long userid = p.getLong("userid", 0);
        Object res = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            if (sesskey == null || userid == 0) {
                Http my = http(BASE + "/my/", null);
                if (my.status == 503 || find(my.body, "<body[^>]*\\b(pagelayout-maintenance)\\b") != null) return state(ctx, "maintenance");
                if (find(my.body, "<body[^>]*\\b(notloggedin)\\b") != null) return state(ctx, "expired");
                sesskey = find(my.body, "\"sesskey\":\"(\\w+)\"");
                String id = find(my.body, "data-userid=\"(\\d+)\"");
                if (sesskey == null || id == null) return state(ctx, "expired");
                userid = Long.parseLong(id);
                p.edit().putString("sesskey", sesskey).putLong("userid", userid).apply();
            }
            String calls = new JSONArray()
                .put(call(0, "message_popup_get_popup_notifications", new JSONObject().put("useridto", userid).put("newestfirst", true).put("limit", 10).put("offset", 0)))
                .put(call(1, "core_message_get_conversations", new JSONObject().put("userid", userid).put("limitfrom", 0).put("limitnum", 20)))
                .toString();
            Http r = http(BASE + "/lib/ajax/service.php?sesskey=" + sesskey + "&info=poll", calls);
            if (r.status == 503) return state(ctx, "maintenance");
            res = new JSONTokener(r.body).nextValue();
            JSONObject err = res instanceof JSONArray ? firstError((JSONArray) res) : (JSONObject) res;
            if (err == null) break;
            JSONObject ex = err.optJSONObject("exception");
            String code = ex != null ? ex.optString("errorcode") : err.optString("errorcode");
            if ("sitemaintenance".equals(code)) return state(ctx, "maintenance");
            if (attempt == 1) return state(ctx, "expired");
            sesskey = null; // stale sesskey or session: look at /my/ once
        }

        JSONArray all = (JSONArray) res;
        JSONObject notes = all.getJSONObject(0).getJSONObject("data");
        JSONArray list = notes.getJSONArray("notifications");
        JSONArray convs = all.getJSONObject(1).getJSONObject("data").getJSONArray("conversations");

        int unreadNotes = notes.optInt("unreadcount", -1);
        if (unreadNotes < 0) {
            unreadNotes = 0;
            for (int i = 0; i < list.length(); i++) if (!list.getJSONObject(i).optBoolean("read")) unreadNotes++;
        }
        int unreadMsgs = 0;
        for (int i = 0; i < convs.length(); i++) if (convs.getJSONObject(i).optInt("unreadcount") > 0) unreadMsgs++;

        // First run only records what exists, so old items don't notify.
        boolean first = !p.contains("seenNote");
        long seenNote = p.getLong("seenNote", 0), seenMsg = p.getLong("seenMsg", 0);
        long maxNote = seenNote, maxMsg = seenMsg;
        int shown = 0;
        for (int i = 0; i < list.length(); i++) {
            JSONObject n = list.getJSONObject(i);
            long id = n.getLong("id");
            maxNote = Math.max(maxNote, id);
            if (first || n.optBoolean("read") || id <= seenNote || shown >= 3) continue;
            String body = n.optString("smallmessage");
            notify(ctx, (int) id, text(n.optString("subject")), text(body.isEmpty() ? n.optString("fullmessage") : body), "notifications");
            shown++;
        }
        shown = 0;
        for (int i = 0; i < convs.length(); i++) {
            JSONObject c = convs.getJSONObject(i);
            JSONObject last = c.getJSONArray("messages").optJSONObject(0);
            if (last == null) continue;
            long id = last.getLong("id");
            maxMsg = Math.max(maxMsg, id);
            if (first || c.optInt("unreadcount") == 0 || id <= seenMsg || last.optLong("useridfrom") == userid || shown >= 3) continue;
            String name = c.optString("name");
            JSONArray members = c.optJSONArray("members");
            if (name.isEmpty() && members != null && members.length() > 0) name = members.getJSONObject(0).optString("fullname");
            notify(ctx, 1_000_000_000 + (int) (c.getLong("id") % 1_000_000_000), name.isEmpty() ? t(ctx, "Новое сообщение", "New message") : name,
                text(last.optString("text")), "messages");
            shown++;
        }
        p.edit().putLong("seenNote", maxNote).putLong("seenMsg", maxMsg).apply();

        UlPortalPlugin.persistSession();
        JSObject ret = state(ctx, "ok");
        ret.put("notifications", unreadNotes);
        ret.put("messages", unreadMsgs);
        return ret;
    }

    // Remembers the session state; notifies once when a working session ends.
    static JSObject state(Context ctx, String state) {
        SharedPreferences p = prefs(ctx);
        String before = p.getString("state", "none");
        p.edit().putString("state", state).apply();
        if ("expired".equals(state)) p.edit().remove("sesskey").remove("userid").apply();
        if ("expired".equals(state) && "ok".equals(before)) {
            notify(ctx, 1, t(ctx, "Сессия на портале завершилась", "Your portal session has ended"),
                t(ctx, "Откройте приложение, чтобы войти снова.", "Open the app to sign in again."), "today");
        }
        JSObject ret = new JSObject();
        ret.put("session", state);
        return ret;
    }

    static void notify(Context ctx, int id, String title, String body, String view) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, t(ctx, "Уведомления и сообщения портала", "Portal notifications and messages"), NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(ctx, MainActivity.class).putExtra("view", view).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String shortBody = body.length() > 200 ? body.substring(0, 200) : body;
        NotificationManagerCompat.from(ctx).notify(id, new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_bell)
            .setContentTitle(title)
            .setContentText(shortBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(shortBody))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build());
    }

    // UI language from app.js prefs (mirrored by UlPrefs); Russian unless English was picked or the phone is English.
    static String t(Context ctx, String ru, String en) {
        String lang = null;
        try {
            lang = new JSONObject(ctx.getSharedPreferences("webprefs", Context.MODE_PRIVATE).getString("localStorage", "{}")).optString("lang", null);
        } catch (Exception ignored) {
        }
        if (lang == null) lang = java.util.Locale.getDefault().getLanguage().equals("ru") ? "ru" : "en";
        return "en".equals(lang) ? en : ru;
    }

    static String text(String html) {
        return Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT).toString().replaceAll("\\s+", " ").trim();
    }

    static String find(String s, String regex) {
        Matcher m = Pattern.compile(regex).matcher(s);
        return m.find() ? m.group(1) : null;
    }

    static JSONObject call(int index, String method, JSONObject args) throws Exception {
        return new JSONObject().put("index", index).put("methodname", method).put("args", args);
    }

    static JSONObject firstError(JSONArray res) {
        for (int i = 0; i < res.length(); i++) {
            JSONObject r = res.optJSONObject(i);
            if (r != null && r.optBoolean("error")) return r;
        }
        return null;
    }

    static class Http {
        int status;
        String body;
    }

    // Plain request with the WebView's portal cookies (shared with the app and the sign-in page).
    static Http http(String url, String json) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20_000);
        c.setReadTimeout(30_000);
        CookieManager cookies = CookieManager.getInstance();
        String cookie = cookies.getCookie(BASE);
        if (cookie != null) c.setRequestProperty("Cookie", cookie);
        if (json != null) {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = c.getOutputStream()) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
            }
        }
        Http r = new Http();
        r.status = c.getResponseCode();
        for (Map.Entry<String, List<String>> h : c.getHeaderFields().entrySet()) {
            if (h.getKey() != null && h.getKey().equalsIgnoreCase("Set-Cookie")) for (String v : h.getValue()) cookies.setCookie(BASE, v);
        }
        try (InputStream in = r.status >= 400 ? c.getErrorStream() : c.getInputStream()) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            for (int n; in != null && (n = in.read(chunk)) > 0; ) buf.write(chunk, 0, n);
            r.body = buf.toString("UTF-8");
        }
        return r;
    }
}
