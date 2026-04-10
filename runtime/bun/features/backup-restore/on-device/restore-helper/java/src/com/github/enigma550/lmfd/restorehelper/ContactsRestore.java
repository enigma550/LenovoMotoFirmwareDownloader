package com.github.enigma550.lmfd.restorehelper;

import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.database.Cursor;
import android.content.Context;
import android.provider.ContactsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

final class ContactsRestore {
    private ContactsRestore() {
    }

    private static boolean isRestorableDisplayName(String displayName) {
        String normalized = displayName == null ? "" : displayName.trim();
        return !normalized.isEmpty() && !"NULL".equalsIgnoreCase(normalized);
    }

    static JSONObject restore(Context context, ContentResolver resolver, String inputPath) throws Exception {
        JSONArray contacts = JsonIo.readArray(inputPath);
        ResultWriter result = new ResultWriter();

        for (int i = 0; i < contacts.length(); i += 1) {
            JSONObject contact = contacts.optJSONObject(i);
            if (contact == null) {
                result.addFailure("CONTACT_ERROR: invalid contact payload at index " + i);
                continue;
            }

            String displayName = contact.optString("displayName", "").trim();
            if (!isRestorableDisplayName(displayName)) {
                result.addFailure("CONTACT_ERROR: missing displayName at index " + i);
                continue;
            }

            try {
                ArrayList<ContentProviderOperation> ops = new ArrayList<ContentProviderOperation>();
                ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null)
                    .build());

                ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, displayName)
                    .build());

                JSONArray phones = contact.optJSONArray("phones");
                if (phones != null) {
                    for (int phoneIndex = 0; phoneIndex < phones.length(); phoneIndex += 1) {
                        JSONObject phone = phones.optJSONObject(phoneIndex);
                        if (phone == null) {
                            continue;
                        }
                        String value = phone.optString("value", "").trim();
                        if (value.isEmpty()) {
                            continue;
                        }

                        ContentProviderOperation.Builder builder = ContentProviderOperation
                            .newInsert(ContactsContract.Data.CONTENT_URI)
                            .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                            .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                            .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, value)
                            .withValue(
                                ContactsContract.CommonDataKinds.Phone.TYPE,
                                phone.has("type") ? phone.optInt("type") : ContactsContract.CommonDataKinds.Phone.TYPE_OTHER
                            );

                        String label = phone.optString("label", "").trim();
                        if (!label.isEmpty()) {
                            builder.withValue(ContactsContract.CommonDataKinds.Phone.LABEL, label);
                        }
                        ops.add(builder.build());
                    }
                }

                JSONArray emails = contact.optJSONArray("emails");
                if (emails != null) {
                    for (int emailIndex = 0; emailIndex < emails.length(); emailIndex += 1) {
                        JSONObject email = emails.optJSONObject(emailIndex);
                        if (email == null) {
                            continue;
                        }
                        String value = email.optString("value", "").trim();
                        if (value.isEmpty()) {
                            continue;
                        }

                        ContentProviderOperation.Builder builder = ContentProviderOperation
                            .newInsert(ContactsContract.Data.CONTENT_URI)
                            .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                            .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE)
                            .withValue(ContactsContract.CommonDataKinds.Email.ADDRESS, value)
                            .withValue(
                                ContactsContract.CommonDataKinds.Email.TYPE,
                                email.has("type") ? email.optInt("type") : ContactsContract.CommonDataKinds.Email.TYPE_OTHER
                            );

                        String label = email.optString("label", "").trim();
                        if (!label.isEmpty()) {
                            builder.withValue(ContactsContract.CommonDataKinds.Email.LABEL, label);
                        }
                        ops.add(builder.build());
                    }
                }

                resolver.applyBatch(ContactsContract.AUTHORITY, ops);
                result.addSuccess();
            } catch (Throwable throwable) {
                result.addFailure("CONTACT_ERROR: " + displayName + " => " + throwable.getClass().getSimpleName() + ": " + throwable.getMessage());
            }
        }

        return result.toJson("contacts");
    }

    static JSONObject deleteByNames(Context context, ContentResolver resolver, String inputPath) throws Exception {
        JSONArray contacts = JsonIo.readArray(inputPath);
        ResultWriter result = new ResultWriter();

        for (int i = 0; i < contacts.length(); i += 1) {
            JSONObject contact = contacts.optJSONObject(i);
            if (contact == null) {
                result.addFailure("CONTACT_DELETE_ERROR: invalid contact payload at index " + i);
                continue;
            }

            String displayName = contact.optString("displayName", "").trim();
            if (!isRestorableDisplayName(displayName)) {
                result.addFailure("CONTACT_DELETE_ERROR: missing displayName at index " + i);
                continue;
            }

            try {
                boolean deletedAny = false;
                Cursor cursor = resolver.query(
                    ContactsContract.Contacts.CONTENT_URI,
                    new String[] { ContactsContract.Contacts._ID },
                    ContactsContract.Contacts.DISPLAY_NAME + "=?",
                    new String[] { displayName },
                    null
                );
                try {
                    if (cursor != null) {
                        while (cursor.moveToNext()) {
                            String contactId = cursor.getString(0);
                            int deleted = resolver.delete(
                                ContactsContract.RawContacts.CONTENT_URI,
                                ContactsContract.RawContacts.CONTACT_ID + "=?",
                                new String[] { contactId }
                            );
                            if (deleted > 0) {
                                deletedAny = true;
                            }
                        }
                    }
                } finally {
                    if (cursor != null) {
                        cursor.close();
                    }
                }

                if (deletedAny) {
                    result.addSuccess();
                } else {
                    result.addFailure("CONTACT_DELETE_ERROR: no contact matched " + displayName);
                }
            } catch (Throwable throwable) {
                result.addFailure("CONTACT_DELETE_ERROR: " + displayName + " => " + throwable.getClass().getSimpleName() + ": " + throwable.getMessage());
            }
        }

        return result.toJson("delete-contacts");
    }
}
