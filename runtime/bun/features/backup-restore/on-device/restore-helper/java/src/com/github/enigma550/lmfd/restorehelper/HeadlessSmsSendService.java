package com.github.enigma550.lmfd.restorehelper;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public final class HeadlessSmsSendService extends Service {
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
