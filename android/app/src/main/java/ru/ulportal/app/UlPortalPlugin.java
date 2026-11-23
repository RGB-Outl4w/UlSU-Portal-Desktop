package ru.ulportal.app;

import android.app.DownloadManager;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.widget.Toast;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.view.View;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

// Native side of portal-android.js: what main.js does with windows, files and the theme on desktop.
@CapacitorPlugin(name = "UlPortal")
public class UlPortalPlugin extends Plugin {
    static final String BASE = "https://portal.ulsu.ru";

    // Back button / gesture: the top portal overlay handles it while one is open, otherwise it goes to app.js
    // (closes dialogs, the sheet, goes up a level). One callback for both: with a callback per overlay the
    // order broke after the activity restarted (a lifecycle-bound callback re-registers on top), so Back
    // reached app.js under an open overlay, which minimized the app with the page still on screen.
    private final List<Runnable> overlayBacks = new ArrayList<>();
    private final List<Runnable> pageCloses = new ArrayList<>(); // portal pages (not sign-in), for handleOnStart
    private long stoppedAt;

    @Override
    public void load() {
        // Transparent, so the theme-coloured window background (res/values*/page.xml) shows instead of white
        // while the page repaints after a light/dark switch.
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        PortalCheck.schedule(getContext());
        handleOnNewIntent(getActivity().getIntent()); // started from a notification
        // Synchronous localStorage mirror for portal-android.js (WebView doesn't flush localStorage before a kill).
        SharedPreferences prefs = getContext().getSharedPreferences("webprefs", Context.MODE_PRIVATE);
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String load() {
                return prefs.getString("localStorage", "{}");
            }

            @JavascriptInterface
            public void save(String json) {
                prefs.edit().putString("localStorage", json).commit();
            }
        }, "UlPrefs");
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (!overlayBacks.isEmpty()) overlayBacks.get(overlayBacks.size() - 1).run();
                else notifyListeners("back", new JSObject());
            }
        });
        // No session known to be alive (first start, after logout or an ended session): open the sign-in page
        // right away, so the app's own screen doesn't show for a moment first. Posted: the activity's content
        // view isn't set yet while plugins load.
        if (!"ok".equals(PortalCheck.prefs(getContext()).getString("state", "none"))) {
            new Handler(Looper.getMainLooper()).post(() -> {
                if (closeLogin == null) showPortal(BASE + "/login/index.php", true, true);
            });
        }
    }

    // app.js has nothing left to close: leave the app like Home does, keeping it alive.
    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        call.resolve();
    }

    // Real portal login page: the user types login/password and the MAX code. We never touch the form,
    // only watch for landing on a logged-in page outside login/2FA paths (same check as main.js login()).
    // Every sign-in request waits on one overlay, which may already be open from start-up (see load()).
    private final List<PluginCall> loginCalls = new ArrayList<>();
    private Runnable closeLogin; // set while the sign-in overlay is open

    @PluginMethod
    public void login(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            loginCalls.add(call);
            if (closeLogin == null) showPortal(BASE + "/login/index.php", true, false);
        });
    }

    private void loginDone(boolean ok) {
        List<PluginCall> calls = new ArrayList<>(loginCalls);
        loginCalls.clear();
        if (!ok) {
            for (PluginCall c : calls) c.reject("Вход отменён");
            return;
        }
        PortalCheck.prefs(getContext()).edit().putString("state", "ok").apply();
        // The sign-in page's RU | EN switch sets the language of the whole portal session; the app reads the
        // portal's pages in Russian, so its session goes back to Russian before anything is loaded.
        new Thread(() -> {
            try {
                PortalCheck.http(BASE + "/my/?lang=ru", null);
            } catch (Exception ignored) {
                // offline: the next page load still works if the language wasn't switched
            }
            for (PluginCall c : calls) c.resolve();
        }).start();
    }

    // Portal pages open in an in-app WebView with the session; anything else in the system browser.
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        if (url.startsWith(BASE)) showPortal(url, false, false);
        else {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException ignored) {
            }
        }
        call.resolve();
    }

    private final AtomicReference<StudyDownload> studyDownload = new AtomicReference<>();

    private static final class StudyDownload {
        final String id;
        volatile boolean cancelled;
        volatile HttpURLConnection connection;

        StudyDownload(String id) {
            this.id = id;
        }
    }

    // The renderer strips unrelated query parameters. Enforce the allowlist again
    // before attaching session cookies, and for every redirect.
    static boolean studyUrlAllowed(URI url) {
        if (!"https".equals(url.getScheme()) || !"portal.ulsu.ru".equals(url.getRawAuthority()) || url.getRawFragment() != null) return false;
        String path = url.getRawPath();
        String query = url.getRawQuery();
        if (path == null || !path.equals(url.normalize().getRawPath()) || path.toLowerCase(Locale.ROOT).matches(".*%(2f|5c|00|2e).*")) return false;
        if (path.matches("/pluginfile\\.php/\\d+/mod_(resource|folder|page|book|label)/.+")) {
            return query == null || query.equals("forcedownload=1");
        }
        if (!path.matches("/mod/(page/view|resource/view|book/view|book/tool/print/index)\\.php") || query == null) return false;
        return query.matches(path.equals("/mod/book/view.php") ? "id=\\d+(&chapterid=\\d+)?" : "id=\\d+");
    }

    @PluginMethod
    public void studyRead(PluginCall call) {
        StudyDownload download = new StudyDownload(call.getString("id", ""));
        if (download.id.isEmpty() || !studyDownload.compareAndSet(null, download)) {
            call.reject("STUDY_INVALID");
            return;
        }
        new Thread(() -> {
            JSObject result = null;
            String error = null;
            try {
                result = readStudyMaterial(URI.create(call.getString("url", "")), download);
            } catch (IllegalArgumentException e) {
                error = "STUDY_INVALID";
            } catch (IOException e) {
                error = e.getMessage() != null && e.getMessage().startsWith("STUDY_") ? e.getMessage() : "STUDY_OFFLINE";
            } finally {
                studyDownload.compareAndSet(download, null);
            }
            if (download.cancelled) call.reject("STUDY_CANCELLED");
            else if (error != null) call.reject(error);
            else call.resolve(result);
        }, "study-download").start();
    }

    private JSObject readStudyMaterial(URI url, StudyDownload download) throws IOException {
        CookieManager cookies = CookieManager.getInstance();
        long deadline = android.os.SystemClock.elapsedRealtime() + 35000;
        for (int hop = 0; hop <= 5; hop++) {
            if (download.cancelled) throw new IOException("STUDY_CANCELLED");
            if (android.os.SystemClock.elapsedRealtime() > deadline) throw new IOException("STUDY_OFFLINE");
            if (!studyUrlAllowed(url)) throw new IOException("STUDY_MISSING");
            HttpURLConnection connection = (HttpURLConnection) url.toURL().openConnection();
            download.connection = connection;
            try {
                if (download.cancelled) throw new IOException("STUDY_CANCELLED");
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(15000);
                connection.setRequestProperty("Cache-Control", "no-store, no-cache");
                connection.setRequestProperty("Accept-Encoding", "identity");
                String cookie = cookies.getCookie(url.toString());
                if (cookie != null) connection.setRequestProperty("Cookie", cookie);
                int status = connection.getResponseCode();
                if (download.cancelled) throw new IOException("STUDY_CANCELLED");
                connection.getHeaderFields().forEach((header, values) -> {
                    if ("Set-Cookie".equalsIgnoreCase(header)) for (String value : values) cookies.setCookie(BASE, value);
                });
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("STUDY_MISSING");
                    url = url.resolve(location);
                    if (BASE.equals(url.getScheme() + "://" + url.getRawAuthority()) && url.getPath().matches("/(login|auth)/.*")) {
                        throw new IOException("STUDY_EXPIRED");
                    }
                    continue;
                }
                if (status == 401) throw new IOException("STUDY_EXPIRED");
                if (status == 403) throw new IOException("STUDY_RESTRICTED");
                if (status >= 500) throw new IOException("STUDY_OFFLINE");
                if (status != 200) throw new IOException("STUDY_MISSING");
                String type = connection.getContentType();
                if (type == null) type = "";
                JSObject reply = new JSObject();
                reply.put("url", url.toString());
                reply.put("type", type);
                if (type.toLowerCase(Locale.ROOT).startsWith("video/")) {
                    reply.put("data", "");
                    return reply;
                }
                int limit = (type.toLowerCase(Locale.ROOT).contains("html") ? 2 : 8) * 1024 * 1024;
                if (connection.getContentLengthLong() > limit) throw new IOException("STUDY_LIMIT");
                try (InputStream input = connection.getInputStream()) {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    byte[] chunk = new byte[16384];
                    for (int size; (size = input.read(chunk)) != -1; ) {
                        if (download.cancelled) throw new IOException("STUDY_CANCELLED");
                        if (android.os.SystemClock.elapsedRealtime() > deadline) throw new IOException("STUDY_OFFLINE");
                        if (size > limit - bytes.size()) throw new IOException("STUDY_LIMIT");
                        bytes.write(chunk, 0, size);
                    }
                    reply.put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                }
                return reply;
            } finally {
                download.connection = null;
                connection.disconnect();
            }
        }
        throw new IOException("STUDY_MISSING");
    }

    @PluginMethod
    public void studyCancel(PluginCall call) {
        StudyDownload download = studyDownload.get();
        if (download != null && download.id.equals(call.getString("id"))) {
            download.cancelled = true;
            studyDownload.compareAndSet(download, null);
            HttpURLConnection connection = download.connection;
            if (connection != null) new Thread(connection::disconnect, "study-cancel").start();
        }
        call.resolve();
    }

    @PluginMethod
    public void studyCopy(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.length() > 200000) {
            call.reject("STUDY_LIMIT");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("ULSU Portal", text);
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean("android.content.extra.IS_SENSITIVE", true);
                clip.getDescription().setExtras(extras);
                clipboard.setPrimaryClip(clip);
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("STUDY_CLIPBOARD");
            }
        });
    }

    static boolean isLoginPage(String page) {
        String path = page.startsWith(BASE + "/") ? Uri.parse(page).getPath() : null;
        return path != null && path.toLowerCase().matches(".*(login|auth|mfa).*");
    }

    // An overlay in the activity's own window, not a Dialog: with a Dialog the keyboard opened under it
    // (focus stayed on the activity window), so the MAX code page could not be typed into.
    // A page-coloured cover sits under the WebView: it hides the app while signing in, and the WebView only
    // fades in once a page has drawn. After sign-in the portal's own page stays hidden while the cover fades
    // out to the app. instant: no fade-in (opened at start-up, before the app has drawn anything).
    private void showPortal(String url, boolean login, boolean instant) {
        AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            FrameLayout cover = new FrameLayout(activity);
            cover.setBackgroundColor(ContextCompat.getColor(activity, R.color.page));
            cover.setClickable(true); // taps don't reach the app underneath
            WebView web = new WebView(activity);
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setBuiltInZoomControls(true);
            s.setDisplayZoomControls(false);
            web.setBackgroundColor(Color.WHITE);
            web.setAlpha(0f);
            // Loader in the app's look: the logo, softly pulsing, shows while nothing is drawn yet (and after
            // sign-in until the app takes over); a thin bar on top follows the page's real load progress.
            float dp = activity.getResources().getDisplayMetrics().density;
            ImageView logo = new ImageView(activity);
            logo.setImageResource(R.drawable.splash_logo);
            ObjectAnimator pulse = ObjectAnimator.ofFloat(logo, "alpha", 1f, 0.45f);
            pulse.setDuration(700);
            pulse.setRepeatMode(ValueAnimator.REVERSE);
            pulse.setRepeatCount(ValueAnimator.INFINITE);
            pulse.start();
            View bar = new View(activity);
            bar.setBackgroundColor(Color.parseColor("#0D45CA"));
            bar.setPivotX(0);
            bar.setScaleX(0.05f);
            cover.addView(logo, new FrameLayout.LayoutParams((int) (64 * dp), (int) (64 * dp), Gravity.CENTER));
            cover.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            cover.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (3 * dp), Gravity.TOP));
            web.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int progress) {
                    bar.animate().cancel();
                    if (progress >= 100) bar.animate().scaleX(1f).alpha(0f).setDuration(200);
                    else {
                        if (bar.getAlpha() == 0f) { bar.setScaleX(0.05f); bar.setAlpha(1f); } // a new page starts loading
                        bar.animate().scaleX(Math.max(0.05f, progress / 100f)).setDuration(150);
                    }
                }
            });
            // Edge-to-edge (targetSdk 35+): keep the page clear of the system bars and the keyboard.
            ViewCompat.setOnApplyWindowInsetsListener(cover, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            boolean[] done = { false }, closing = { false };
            Runnable[] close = { null };
            // Sign-in: back steps back through the sign-in pages (password -> MAX code), then cancels.
            // A portal page: one back closes it and returns to the app screen it was opened from.
            Runnable back = () -> {
                if (login && web.canGoBack()) web.goBack();
                else close[0].run();
            };
            close[0] = () -> {
                if (closing[0]) return;
                closing[0] = true;
                overlayBacks.remove(back);
                pageCloses.remove(close[0]);
                if (login) {
                    closeLogin = null;
                    if (!done[0]) loginDone(false);
                }
                pulse.cancel();
                cover.animate().alpha(0f).setDuration(220).withEndAction(() -> {
                    ((ViewGroup) cover.getParent()).removeView(cover);
                    web.destroy();
                });
            };
            web.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String page, Bitmap favicon) {
                    // Leaving the sign-in pages: the portal itself (/my/) loads next. Keep it out of sight.
                    if (login && page.startsWith(BASE + "/") && !isLoginPage(page)) view.animate().alpha(0f).setDuration(120);
                }

                // Fades in only once loaded: the portal's pages draw in visible stages (photo, bare form, styles).
                @Override
                public void onPageCommitVisible(WebView view, String page) {
                    fitWidth(view);
                    if (isLoginPage(page)) loginStyle(view);
                }

                @Override
                public void onPageFinished(WebView view, String page) {
                    fitWidth(view);
                    if (isLoginPage(page)) loginStyle(view);
                    if (closing[0]) return;
                    if (!login || isLoginPage(page) || !page.startsWith(BASE + "/")) {
                        view.animate().alpha(1f).setDuration(180);
                        return;
                    }
                    view.evaluateJavascript("document.body.classList.contains('notloggedin')", (r) -> {
                        if (done[0] || closing[0]) return;
                        if ("true".equals(r)) {
                            view.animate().alpha(1f).setDuration(180); // still signed out: show whatever this is
                            return;
                        }
                        done[0] = true;
                        persistSession();
                        loginDone(true);
                        close[0].run();
                    });
                }
            });
            // Files linked from portal pages: system download with the session cookie.
            web.setDownloadListener((link, agent, disposition, mime, length) -> {
                // After sign-in Moodle opens the URL that asked for it; a file (e.g. sync.json) lands here
                // instead of onPageFinished. Count it as signed in and skip it; its request retries.
                if (login) {
                    if (done[0] || closing[0]) return;
                    done[0] = true;
                    persistSession();
                    loginDone(true);
                    close[0].run();
                    return;
                }
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(link));
                req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(link));
                req.addRequestHeader("User-Agent", agent);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(link, disposition, mime));
                getContext().getSystemService(DownloadManager.class).enqueue(req);
            });
            if (login) closeLogin = close[0];
            else pageCloses.add(close[0]);
            overlayBacks.add(back);
            if (!instant) {
                cover.setAlpha(0f);
                cover.animate().alpha(1f).setDuration(200);
            }
            activity.addContentView(cover, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            ViewCompat.requestApplyInsets(cover);
            web.requestFocus();
            web.loadUrl(url);
        });
    }

    // Portal pages are desktop-width in places (wide tables, fixed-width blocks, big images): make them fit
    // the screen so the page only scrolls vertically. Words wrap only when they don't fit (overflow-wrap:
    // break-word; "anywhere" squeezed table cells to one letter per line). A table still wider than the
    // screen scrolls sideways inside itself. Pinch zoom still works.
    private static final String FIT_WIDTH = "(function(){"
        + "if(!document.getElementById('ulp-fit')){"
        + "var m=document.querySelector('meta[name=viewport]');"
        + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
        + "m.content='width=device-width, initial-scale=1';"
        + "var s=document.createElement('style');s.id='ulp-fit';"
        + "s.textContent='html,body{max-width:100%!important;overflow-x:hidden!important;overflow-x:clip!important}"
        + "img,video,iframe,embed,object,canvas,pre,div,section,form,fieldset,header,footer,nav,main,article,.container,.container-fluid{max-width:100%!important}"
        + "img,video{height:auto!important}pre{white-space:pre-wrap!important}"
        + "p,li,td,th,a,span,div,h1,h2,h3,h4,h5,h6{overflow-wrap:break-word}"
        + ".ulp-wide{display:block!important;overflow-x:auto!important;max-width:100%!important}';"
        + "document.head.appendChild(s);}"
        + "var w=document.documentElement.clientWidth;"
        + "document.querySelectorAll('table').forEach(function(t){if(t.scrollWidth>w&&!t.closest('.ulp-wide'))t.classList.add('ulp-wide');});"
        + "})()";

    // The real sign-in pages in the app's look: login.css (shared with the desktop sign-in window, copied into
    // the web assets by build-www.js). Only styling; the form and where it sends stay the portal's own.
    private String loginCss;

    private void loginStyle(WebView view) {
        try {
            if (loginCss == null) {
                try (InputStream in = getContext().getAssets().open("public/login.css")) {
                    java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    for (int n; (n = in.read(chunk)) > 0; ) buf.write(chunk, 0, n); // readAllBytes needs API 33
                    loginCss = buf.toString("UTF-8");
                }
            }
            view.evaluateJavascript("(function(c){if(document.getElementById('ulp-login'))return;var s=document.createElement('style');"
                + "s.id='ulp-login';s.textContent=c;document.head.appendChild(s);})(" + org.json.JSONObject.quote(loginCss) + ")", null);
        } catch (Exception ignored) {
            // no styling: the portal's own look still works
        }
    }

    private static void fitWidth(WebView view) {
        view.evaluateJavascript(FIT_WIDTH, null);
    }

    // Save bytes to Downloads, then open them in the system viewer (PDF, documents, video).
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name", "file");
        String type = call.getString("type", "application/octet-stream");
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, type);
        String dir = call.getString("dir");
        if (dir != null) values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + dir);
        Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            call.reject("Не удалось сохранить файл");
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }
        String note = call.getString("note");
        if (!call.getBoolean("open", true)) {
            if (note != null) getActivity().runOnUiThread(() -> Toast.makeText(getContext(), note, Toast.LENGTH_SHORT).show());
        } else try {
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(view, name));
        } catch (ActivityNotFoundException ignored) {
            // no viewer for this type: the file still sits in Downloads
        }
        JSObject ret = new JSObject();
        ret.put("name", name);
        call.resolve(ret);
    }

    // Unread counts + session state for the app (portal.poll); also notifies about new items.
    @PluginMethod
    public void poll(PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(PortalCheck.check(getContext()));
            } catch (Exception e) {
                call.reject("OFFLINE: " + e.getMessage());
            }
        }).start();
    }

    // In-app update (portal.installUpdate): the APK from GitHub Releases into the cache, checked against the
    // SHA-256 GitHub lists for it, then Android's own install screen (same signing key: it installs over this
    // copy). The first time, Android wants "Install unknown apps" allowed for this app: its settings page
    // opens and the user taps «Установить» again (the downloaded file is reused).
    static final String RELEASES = "https://github.com/RGB-Outl4w/UlSU-Portal-Desktop/releases/download/";

    @PluginMethod
    public void update(PluginCall call) {
        String url = call.getString("url", ""), sha = call.getString("sha256", ""), name = call.getString("name", "");
        long size = call.getLong("size", 0L);
        if (!url.startsWith(RELEASES) || !name.matches("ULSU-Portal-Android-[0-9A-Za-z.-]+\\.apk") || !sha.matches("[0-9a-f]{64}")) {
            call.reject("bad update");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "update"), apk = new File(dir, name);
                boolean have = false;
                if (apk.isFile()) try (InputStream in = new FileInputStream(apk)) { have = sha.equals(sha256(in, null, 0)); }
                if (!have) {
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    dir.mkdirs();
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestProperty("User-Agent", "ulportal");
                    if (c.getResponseCode() != 200) throw new Exception("GitHub: " + c.getResponseCode());
                    String got;
                    try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) { got = sha256(in, out, size); }
                    if (!sha.equals(got)) {
                        apk.delete();
                        call.reject("Файл обновления повреждён, попробуйте ещё раз");
                        return;
                    }
                }
                JSObject ret = new JSObject();
                Intent intent;
                if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                    intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                    ret.put("state", "permission");
                } else {
                    Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                    intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    ret.put("state", "install");
                }
                getActivity().runOnUiThread(() -> {
                    getActivity().startActivity(intent);
                    call.resolve(ret);
                });
            } catch (Exception e) {
                call.reject("OFFLINE: " + e.getMessage());
            }
        }).start();
    }

    // Copies in to out (if any) and returns the SHA-256 in hex; with size, sends updateProgress (0..1) to app.js.
    private String sha256(InputStream in, OutputStream out, long size) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[65536];
        long got = 0, sent = 0;
        for (int n; (n = in.read(buf)) > 0; ) {
            md.update(buf, 0, n);
            if (out != null) out.write(buf, 0, n);
            got += n;
            if (size > 0 && System.currentTimeMillis() - sent > 250) {
                sent = System.currentTimeMillis();
                JSObject p = new JSObject();
                p.put("p", (double) got / size);
                notifyListeners("updateProgress", p);
            }
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    // Asked once, after the first successful sign-in or start with a session (Android 13+).
    @PluginMethod
    public void askNotifications(PluginCall call) {
        SharedPreferences p = PortalCheck.prefs(getContext());
        if (Build.VERSION.SDK_INT >= 33 && !p.getBoolean("asked", false)
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            p.edit().putBoolean("asked", true).apply();
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }
        call.resolve();
    }

    // Notification tap: app.js opens the matching view (kept until the listener is attached on a cold start).
    @Override
    protected void handleOnNewIntent(Intent intent) {
        String view = intent == null ? null : intent.getStringExtra("view");
        if (view == null) return;
        intent.removeExtra("view");
        JSObject data = new JSObject();
        data.put("view", view);
        notifyListeners("navigate", data, true);
    }

    @PluginMethod
    public void clearCookies(PluginCall call) {
        PortalCheck.reset(getContext());
        CookieManager.getInstance().removeAllCookies((ok) -> {
            CookieManager.getInstance().flush();
            call.resolve();
        });
    }

    // system / light / dark: the WebView's prefers-color-scheme follows the app's night mode.
    @PluginMethod
    public void theme(PluginCall call) {
        String mode = call.getString("mode", "system");
        int night = "dark".equals(mode) ? AppCompatDelegate.MODE_NIGHT_YES
            : "light".equals(mode) ? AppCompatDelegate.MODE_NIGHT_NO : AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        getActivity().runOnUiThread(() -> {
            if (AppCompatDelegate.getDefaultNightMode() != night) AppCompatDelegate.setDefaultNightMode(night);
            call.resolve();
        });
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
        } catch (Exception e) {
            ret.put("version", "?");
        }
        android.content.pm.PackageInfo wv = WebView.getCurrentWebViewPackage();
        ret.put("webview", wv != null ? wv.versionName : "?");
        ret.put("android", Build.VERSION.RELEASE);
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    // MoodleSession has no expiry, so Android drops it when the process dies. Re-set the current value
    // with one (like main.js persistSessionCookie) and write it to disk. Runs on sign-in and on every pause,
    // which also catches a session id the portal rotated meanwhile.
    static final int KEEP_DAYS = 30;

    static void persistSession() {
        CookieManager cookies = CookieManager.getInstance();
        String all = cookies.getCookie(BASE);
        if (all == null) return;
        for (String c : all.split("; ")) {
            if (!c.startsWith("MoodleSession=")) continue;
            cookies.setCookie(BASE, c + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + KEEP_DAYS * 86400);
        }
        cookies.flush();
    }

    @Override
    protected void handleOnPause() {
        persistSession();
    }

    // A portal page left open doesn't come back when the app is opened again later: the app's own screen does.
    // ponytail: "later" = away 5+ min; a short switch (copying a code, a file viewer) keeps the page.
    @Override
    protected void handleOnStop() {
        stoppedAt = System.currentTimeMillis();
    }

    @Override
    protected void handleOnStart() {
        if (stoppedAt > 0 && System.currentTimeMillis() - stoppedAt > 5 * 60_000) {
            for (Runnable c : new ArrayList<>(pageCloses)) c.run();
        }
    }
}
