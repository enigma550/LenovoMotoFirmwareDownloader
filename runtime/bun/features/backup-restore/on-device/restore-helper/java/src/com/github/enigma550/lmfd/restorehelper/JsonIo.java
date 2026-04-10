package com.github.enigma550.lmfd.restorehelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

final class JsonIo {
    private JsonIo() {
    }

    static JSONArray readArray(String filePath) throws Exception {
        StringBuilder builder = new StringBuilder();
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(new FileInputStream(filePath), StandardCharsets.UTF_8)
        );
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        } finally {
            reader.close();
        }
        return new JSONArray(builder.toString());
    }

    static void writeObject(String filePath, JSONObject object) throws Exception {
        File file = new File(filePath);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        OutputStreamWriter writer = new OutputStreamWriter(
            new FileOutputStream(file),
            StandardCharsets.UTF_8
        );
        try {
            writer.write(object.toString());
        } finally {
            writer.close();
        }
    }
}
