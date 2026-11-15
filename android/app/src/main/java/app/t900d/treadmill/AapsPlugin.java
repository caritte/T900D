package app.t900d.treadmill;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Expose à la page le dernier état reçu d'AAPS par AapsReceiver. */
@CapacitorPlugin(name = "Aaps")
public class AapsPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(AapsReceiver.PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject();
        r.put("available", p.contains("receivedAt"));
        for (String k : AapsReceiver.DOUBLES) if (p.contains(k)) r.put(k, Double.parseDouble(p.getString(k, "0")));
        for (String k : new String[] { "glucoseTimeStamp", "receivedAt" }) if (p.contains(k)) r.put(k, p.getLong(k, 0));
        for (String k : new String[] { "units", "slopeArrow" }) if (p.contains(k)) r.put(k, p.getString(k, ""));
        call.resolve(r);
    }
}
