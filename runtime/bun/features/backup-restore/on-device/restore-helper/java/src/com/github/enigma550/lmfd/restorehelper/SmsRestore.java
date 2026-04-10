package com.github.enigma550.lmfd.restorehelper;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.provider.Telephony;

import org.json.JSONArray;
import org.json.JSONObject;

final class SmsRestore {
    private SmsRestore() {
    }

    private static boolean isMeaningfulText(String value) {
        if (value == null) {
            return false;
        }

        String normalized = value.trim();
        return !normalized.isEmpty() && !"NULL".equalsIgnoreCase(normalized);
    }

    private static Integer parseOptionalSubId(JSONObject message) {
        if (!message.has("subId")) {
            return null;
        }

        String raw = message.optString("subId", "").trim();
        if (raw.isEmpty() || "NULL".equalsIgnoreCase(raw)) {
            return null;
        }

        try {
            return Integer.valueOf(raw);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static ContentValues buildValues(JSONObject message, String address, String body, long date, int type, boolean includeSubId) {
        ContentValues values = new ContentValues();
        values.put(Telephony.Sms.ADDRESS, address);
        values.put(Telephony.Sms.BODY, body);
        values.put(Telephony.Sms.DATE, date);
        values.put(Telephony.Sms.TYPE, type);
        if (message.has("read")) {
            values.put(Telephony.Sms.READ, message.optInt("read", 1));
            values.put(Telephony.Sms.SEEN, message.optInt("read", 1));
        }

        String serviceCenter = message.optString("serviceCenter", "");
        if (isMeaningfulText(serviceCenter)) {
            values.put(Telephony.Sms.SERVICE_CENTER, serviceCenter.trim());
        }

        if (includeSubId) {
            Integer subId = parseOptionalSubId(message);
            if (subId != null && subId.intValue() >= 0) {
                values.put("sub_id", subId.intValue());
            }
        }

        return values;
    }

    static JSONObject restore(Context context, ContentResolver resolver, String inputPath) throws Exception {
        JSONArray messages = JsonIo.readArray(inputPath);
        ResultWriter result = new ResultWriter();

        for (int i = 0; i < messages.length(); i += 1) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null) {
                result.addFailure("SMS_ERROR: invalid message payload at index " + i);
                continue;
            }

            String address = message.optString("address", "").trim();
            String body = message.optString("body", "");
            long date = message.optLong("date", System.currentTimeMillis());
            int type = message.optInt("type", Telephony.Sms.MESSAGE_TYPE_INBOX);

            if (address.isEmpty() || body.isEmpty()) {
                result.addFailure("SMS_ERROR: missing address/body at index " + i);
                continue;
            }

            try {
                Uri insertedUri = resolver.insert(
                    Telephony.Sms.CONTENT_URI,
                    buildValues(message, address, body, date, type, true)
                );
                if (insertedUri == null) {
                    insertedUri = resolver.insert(
                        Telephony.Sms.CONTENT_URI,
                        buildValues(message, address, body, date, type, false)
                    );
                }
                if (insertedUri == null) {
                    result.addFailure("SMS_ERROR: " + address + " => insert returned null");
                    continue;
                }
                result.addSuccess();
            } catch (Throwable throwable) {
                result.addFailure("SMS_ERROR: " + address + " => " + throwable.getClass().getSimpleName() + ": " + throwable.getMessage());
            }
        }

        return result.toJson("messages");
    }

    static JSONObject deleteExact(Context context, ContentResolver resolver, String inputPath) throws Exception {
        JSONArray messages = JsonIo.readArray(inputPath);
        ResultWriter result = new ResultWriter();

        for (int i = 0; i < messages.length(); i += 1) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null) {
                result.addFailure("SMS_DELETE_ERROR: invalid message payload at index " + i);
                continue;
            }

            String address = message.optString("address", "").trim();
            String body = message.optString("body", "");
            long date = message.optLong("date", -1L);
            String providerId = message.optString("providerId", "").trim();
            String logicalId = message.optString("id", "").trim();
            if (address.isEmpty() || body.isEmpty() || date < 0L) {
                result.addFailure("SMS_DELETE_ERROR: missing address/body/date at index " + i);
                continue;
            }

            try {
                String smsRowId = providerId;
                if (smsRowId.isEmpty()) {
                    if (logicalId.matches("\\d+")) {
                        smsRowId = logicalId;
                    } else if (logicalId.startsWith("msg-") && logicalId.length() > 4) {
                        smsRowId = logicalId.substring(4);
                    }
                }

                int deleted;
                if (!smsRowId.isEmpty()) {
                    deleted = resolver.delete(
                        Telephony.Sms.CONTENT_URI,
                        Telephony.Sms._ID + "=?",
                        new String[] { smsRowId }
                    );
                } else {
                    deleted = resolver.delete(
                        Telephony.Sms.CONTENT_URI,
                        Telephony.Sms.ADDRESS + "=? AND " + Telephony.Sms.BODY + "=? AND " + Telephony.Sms.DATE + "=?",
                        new String[] { address, body, String.valueOf(date) }
                    );
                }
                if (deleted > 0) {
                    result.addSuccess();
                } else {
                    result.addFailure("SMS_DELETE_ERROR: no message matched " + address + " @ " + date);
                }
            } catch (Throwable throwable) {
                result.addFailure("SMS_DELETE_ERROR: " + address + " => " + throwable.getClass().getSimpleName() + ": " + throwable.getMessage());
            }
        }

        return result.toJson("delete-messages");
    }
}
