package lmfd.prompt;

import android.app.ActivityThread;
import android.content.Context;

final class AndroidRuntime {
    private AndroidRuntime() {
    }

    static Context getSystemContext() throws Exception {
        ActivityThread thread = ActivityThread.systemMain();
        return thread.getSystemContext();
    }
}
