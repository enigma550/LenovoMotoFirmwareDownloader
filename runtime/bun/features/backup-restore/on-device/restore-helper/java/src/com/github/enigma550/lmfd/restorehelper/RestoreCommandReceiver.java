package com.github.enigma550.lmfd.restorehelper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class RestoreCommandReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        final Intent workIntent = intent;
        new Thread(() -> {
            try {
                RestoreCommandRunner.run(appContext, workIntent);
            } finally {
                pendingResult.finish();
            }
        }, "lmfd-restore-command-receiver").start();
    }
}
