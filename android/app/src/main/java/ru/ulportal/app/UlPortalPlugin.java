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
import android.provider.MediaStore;
import android.util.Base64;
import android.graphics.Color;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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

// Native side of portal-android.js: what main.js does with windows, files and the theme on desktop.
@CapacitorPlugin(name = "UlPortal")
public class UlPortalPlugin extends Plugin {
    static final String BASE = "https://portal.ulsu.ru";

    // Back button / gesture goes to app.js (closes dialogs, the sheet, goes up a level). Registered first,
    // so a portal overlay's own callback (added later) still wins while it is open.
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
                notifyListeners("back", new JSObject());
            }
        });
    }

    // app.js has nothing left to close: leave the app like Home does, keeping it alive.
    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        call.resolve();
    }

    // Real portal login page: the user types login/password and the MAX code. We never touch the form,
    // only watch for landing on a logged-in page outside login/2FA paths (same check as main.js login()).
    @PluginMethod
    public void login(PluginCall call) {
        showPortal(call, BASE + "/login/index.php", true);
    }

    // Portal pages open in an in-app WebView with the session; anything else in the system browser.
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        if (url.startsWith(BASE)) {
            showPortal(call, url, false);
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
        }
        call.resolve();
    }

    // An overlay in the activity's own window, not a Dialog: with a Dialog the keyboard opened under it
    // (focus stayed on the activity window), so the MAX code page could not be typed into.
    private void showPortal(PluginCall call, String url, boolean login) {
        AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            WebView web = new WebView(activity);
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setBuiltInZoomControls(true);
            s.setDisplayZoomControls(false);
            web.setBackgroundColor(Color.WHITE);
            // Edge-to-edge (targetSdk 35+): keep the page clear of the system bars and the keyboard.
            ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            boolean[] done = { false };
            Runnable[] close = { null };
            OnBackPressedCallback back = new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    if (web.canGoBack()) web.goBack(); // back goes back in the page history, then closes
                    else close[0].run();
                }
            };
            close[0] = () -> {
                if (web.getParent() == null) return;
                back.remove();
                ((ViewGroup) web.getParent()).removeView(web);
                web.destroy();
                if (login && !done[0]) call.reject("Вход отменён");
            };
            web.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String page) {
                    if (!login || done[0] || !page.startsWith(BASE + "/")) return;
                    String path = Uri.parse(page).getPath();
                    if (path != null && path.toLowerCase().matches(".*(login|auth|mfa).*")) return;
                    view.evaluateJavascript("document.body.classList.contains('notloggedin')", (r) -> {
                        if (done[0] || "true".equals(r)) return;
                        done[0] = true;
                        persistSession();
                        call.resolve();
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
            activity.getOnBackPressedDispatcher().addCallback(back);
            activity.addContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            ViewCompat.requestApplyInsets(web);
            web.requestFocus();
            web.loadUrl(url);
            if (!login) call.resolve();
        });
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
}
