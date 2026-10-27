package ru.ulportal.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UlPortalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
