package com.github.enigma550.lmfd.restorehelper;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

final class RestoreCommandRunner {
    private RestoreCommandRunner() {
    }

    static void run(Context context, Intent intent) {
        String outputPath = intent == null ? null : intent.getStringExtra(RestoreCommandContract.EXTRA_OUTPUT);
        try {
            String mode = intent == null ? null : intent.getStringExtra(RestoreCommandContract.EXTRA_MODE);
            String inputPath = intent == null ? null : intent.getStringExtra(RestoreCommandContract.EXTRA_INPUT);
            if (mode == null || mode.trim().isEmpty()) {
                throw new IllegalArgumentException("Missing mode");
            }
            if (inputPath == null || inputPath.trim().isEmpty()) {
                throw new IllegalArgumentException("Missing input path");
            }
            if (outputPath == null || outputPath.trim().isEmpty()) {
                throw new IllegalArgumentException("Missing output path");
            }

            ContentResolver resolver = context.getContentResolver();
            JSONObject result;
            switch (mode) {
                case "contacts":
                    result = ContactsRestore.restore(context, resolver, inputPath);
                    break;
                case "messages":
                    result = SmsRestore.restore(context, resolver, inputPath);
                    break;
                case "delete-contacts":
                    result = ContactsRestore.deleteByNames(context, resolver, inputPath);
                    break;
                case "delete-messages":
                    result = SmsRestore.deleteExact(context, resolver, inputPath);
                    break;
                default:
                    throw new IllegalArgumentException("Unsupported mode: " + mode);
            }
            JsonIo.writeObject(outputPath, result);
        } catch (Throwable throwable) {
            try {
                JSONObject failure = new JSONObject();
                failure.put("mode", intent == null ? "unknown" : intent.getStringExtra(RestoreCommandContract.EXTRA_MODE));
                failure.put("attempted", 0);
                failure.put("restored", 0);
                failure.put("failed", 0);
                failure.put("fatal", throwable.getClass().getSimpleName() + ": " + throwable.getMessage());
                if (outputPath != null && !outputPath.trim().isEmpty()) {
                    JsonIo.writeObject(outputPath, failure);
                }
            } catch (Throwable ignored) {
            }
        }
    }
}
