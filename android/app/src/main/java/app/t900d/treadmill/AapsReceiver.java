package app.t900d.treadmill;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

/**
 * Reçoit l'état diffusé par AAPS (plugin « Samsung Tizen », action info.nightscout.androidaps.status)
 * et garde la dernière valeur. AAPS n'envoie qu'aux récepteurs déclarés dans le manifeste :
 * un récepteur enregistré dynamiquement ne recevrait rien.
 */
public class AapsReceiver extends BroadcastReceiver {
    static final String PREFS = "aaps";
    // Clés numériques recopiées telles quelles (voir TizenPlugin.kt dans AAPS).
    static final String[] DOUBLES = { "glucoseMgdl", "deltaMgdl", "iob", "bolusIob", "basalIob", "cob", "high", "low" };

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle b = intent.getExtras();
        if (b == null) return;
        SharedPreferences.Editor e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.clear(); // un état incomplet ne doit pas garder d'anciennes valeurs
        for (String k : DOUBLES) if (b.containsKey(k)) e.putString(k, String.valueOf(b.getDouble(k)));
        if (b.containsKey("glucoseTimeStamp")) e.putLong("glucoseTimeStamp", b.getLong("glucoseTimeStamp"));
        if (b.containsKey("units")) e.putString("units", b.getString("units"));
        if (b.containsKey("slopeArrow")) e.putString("slopeArrow", b.getString("slopeArrow"));
        e.putLong("receivedAt", System.currentTimeMillis());
        e.apply();
    }
}
