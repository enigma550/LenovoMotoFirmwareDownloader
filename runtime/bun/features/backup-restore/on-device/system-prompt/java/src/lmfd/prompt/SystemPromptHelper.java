package lmfd.prompt;

import android.content.Context;
import android.content.Intent;
import android.telephony.Telephony;

public final class SystemPromptHelper {
    private SystemPromptHelper() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.out.println("ERROR: missing command");
            return;
        }

        String command = args[0];
        if ("change-default-sms".equals(command)) {
            if (args.length < 2) {
                System.out.println("ERROR: missing package name");
                return;
            }
            openChangeDefaultSms(args[1]);
            System.out.println("OK");
            return;
        }

        System.out.println("ERROR: unsupported command " + command);
    }

    private static void openChangeDefaultSms(String packageName) throws Exception {
        Context context = AndroidRuntime.getSystemContext();
        Intent intent = new Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT)
            .putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
