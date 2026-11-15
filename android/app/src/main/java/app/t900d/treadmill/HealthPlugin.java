package app.t900d.treadmill;

import android.health.connect.HealthConnectException;
import android.health.connect.InsertRecordsResponse;
import android.os.Build;
import android.os.OutcomeReceiver;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Enregistre les séances dans Health Connect (Android 14 et plus, API intégrée au système).
 * Sur ces versions, les permissions santé se demandent comme des permissions Android ordinaires.
 */
@CapacitorPlugin(
    name = "Health",
    permissions = {
        @Permission(alias = "health", strings = {
            "android.permission.health.WRITE_EXERCISE",
            "android.permission.health.WRITE_DISTANCE",
            "android.permission.health.WRITE_HEART_RATE",
            "android.permission.health.WRITE_TOTAL_CALORIES_BURNED",
        })
    }
)
public class HealthPlugin extends Plugin {
    private static boolean supported() { return Build.VERSION.SDK_INT >= 34; }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("available", supported());
        r.put("granted", supported() && getPermissionState("health") == PermissionState.GRANTED);
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(state()); }

    @PluginMethod
    public void request(PluginCall call) {
        if (!supported() || getPermissionState("health") == PermissionState.GRANTED) { call.resolve(state()); return; }
        requestPermissionForAlias("health", call, "onPermission");
    }

    @PermissionCallback
    private void onPermission(PluginCall call) { call.resolve(state()); }

    /** { start, end (ms), title, distance (m), kcal, hr: [t0, bpm0, t1, bpm1, …] } */
    @PluginMethod
    public void saveSession(final PluginCall call) {
        if (!supported()) { call.reject("Health Connect demande Android 14 ou plus récent."); return; }
        if (getPermissionState("health") != PermissionState.GRANTED) { call.reject("Permission Health Connect non accordée."); return; }
        try {
            JSONObject d = call.getData();
            JSONArray a = d.optJSONArray("hr");
            int n = a == null ? 0 : a.length() / 2;
            long[][] hr = new long[n][2];
            for (int i = 0; i < n; i++) { hr[i][0] = a.optLong(2 * i); hr[i][1] = a.optLong(2 * i + 1); }
            HealthWriter.write(getContext(), d.optLong("start"), d.optLong("end"), d.optString("title", "T900D"),
                d.optDouble("distance", 0), d.optDouble("kcal", 0), hr,
                new OutcomeReceiver<InsertRecordsResponse, HealthConnectException>() {
                    @Override public void onResult(InsertRecordsResponse response) {
                        JSObject r = new JSObject();
                        r.put("records", response.getRecords().size());
                        call.resolve(r);
                    }
                    @Override public void onError(HealthConnectException e) { call.reject("Health Connect : " + e.getMessage()); }
                });
        } catch (Exception e) {
            call.reject("Health Connect : " + e);
        }
    }
}
