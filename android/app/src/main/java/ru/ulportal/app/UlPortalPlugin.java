package ru.ulportal.app;

import android.app.DownloadManager;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
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
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

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
        if (ok) PortalCheck.prefs(getContext()).edit().putString("state", "ok").apply();
        for (PluginCall c : loginCalls) {
            if (ok) c.resolve();
            else c.reject("Вход отменён");
        }
        loginCalls.clear();
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
            // Shows while nothing is drawn yet, and after sign-in until the app takes over.
            cover.addView(new ProgressBar(activity), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
            cover.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
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
                }

                @Override
                public void onPageFinished(WebView view, String page) {
                    fitWidth(view);
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
    // the screen so only vertical scrolling is left. Pinch zoom still works.
    private static final String FIT_WIDTH = "(function(){if(document.getElementById('ulp-fit'))return;"
        + "var m=document.querySelector('meta[name=viewport]');"
        + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
        + "m.content='width=device-width, initial-scale=1';"
        + "var s=document.createElement('style');s.id='ulp-fit';"
        + "s.textContent='html,body{max-width:100%!important;overflow-x:hidden!important;overflow-x:clip!important}"
        + "img,video,iframe,embed,object,canvas,table,pre,.container,.container-fluid{max-width:100%!important}"
        + "img,video{height:auto!important}pre{white-space:pre-wrap!important}"
        + "td,th,p,li,a,span,div{overflow-wrap:anywhere}';"
        + "document.head.appendChild(s);})()";

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
        try {
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
