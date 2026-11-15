package app.t900d.treadmill;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AapsPlugin.class); // avant super.onCreate, qui démarre le pont
        registerPlugin(HealthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
