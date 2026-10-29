package ru.ulportal.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The launch theme's splash (logo on the page colour) fades out into the app instead of cutting.
        SplashScreen.installSplashScreen(this).setOnExitAnimationListener((splash) ->
            splash.getView().animate().alpha(0f).setDuration(260).withEndAction(splash::remove));
        registerPlugin(UlPortalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
