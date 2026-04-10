package com.github.enigma550.lmfd.restorehelper;

import org.json.JSONArray;
import org.json.JSONObject;

final class ResultWriter {
    private int attempted;
    private int restored;
    private int failed;
    private final JSONArray detailLines = new JSONArray();

    void addSuccess() {
        attempted += 1;
        restored += 1;
    }

    void addFailure(String detail) {
        attempted += 1;
        failed += 1;
        detailLines.put(detail);
    }

    JSONObject toJson(String mode) throws Exception {
        JSONObject output = new JSONObject();
        output.put("mode", mode);
        output.put("attempted", attempted);
        output.put("restored", restored);
        output.put("failed", failed);
        output.put("detailLines", detailLines);
        return output;
    }
}
