package app.t900d.treadmill;

import android.annotation.TargetApi;
import android.content.Context;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.InsertRecordsResponse;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.Metadata;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.TotalCaloriesBurnedRecord;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Length;
import android.os.OutcomeReceiver;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Écrit une séance dans Health Connect avec l'API intégrée à Android 14 et plus.
 * Classe à part : elle ne doit être chargée que sur ces versions (voir HealthPlugin).
 */
@TargetApi(34)
final class HealthWriter {
    static final String[] PERMISSIONS = {
        "android.permission.health.WRITE_EXERCISE",
        "android.permission.health.WRITE_DISTANCE",
        "android.permission.health.WRITE_HEART_RATE",
        "android.permission.health.WRITE_TOTAL_CALORIES_BURNED",
    };

    private HealthWriter() {}

    // L'identifiant client rend l'écriture répétable : renvoyer la même séance la remplace au lieu de la dupliquer.
    private static Metadata meta(long startMs, String kind) {
        return new Metadata.Builder().setClientRecordId("t900d-" + startMs + "-" + kind).setClientRecordVersion(System.currentTimeMillis()).build();
    }

    /** hr : paires [instant en ms, battements par minute]. */
    static void write(Context context, long startMs, long endMs, String title, double meters, double kcal, long[][] hr,
                      OutcomeReceiver<InsertRecordsResponse, HealthConnectException> callback) {
        Instant start = Instant.ofEpochMilli(startMs), end = Instant.ofEpochMilli(endMs);
        List<Record> records = new ArrayList<>();
        records.add(new ExerciseSessionRecord.Builder(meta(startMs, "session"), start, end, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL)
            .setTitle(title).build());
        if (meters > 0) records.add(new DistanceRecord.Builder(meta(startMs, "distance"), start, end, Length.fromMeters(meters)).build());
        if (kcal > 0) records.add(new TotalCaloriesBurnedRecord.Builder(meta(startMs, "energie"), start, end, Energy.fromCalories(kcal * 1000)).build());
        List<HeartRateRecord.HeartRateSample> samples = new ArrayList<>();
        for (long[] p : hr) {
            if (p[1] > 0 && p[0] >= startMs && p[0] <= endMs) samples.add(new HeartRateRecord.HeartRateSample(p[1], Instant.ofEpochMilli(p[0])));
        }
        if (!samples.isEmpty()) records.add(new HeartRateRecord.Builder(meta(startMs, "fc"), start, end, samples).build());
        context.getSystemService(HealthConnectManager.class).insertRecords(records, context.getMainExecutor(), callback);
    }
}
