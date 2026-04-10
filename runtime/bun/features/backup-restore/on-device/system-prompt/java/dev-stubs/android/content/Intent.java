package android.content;

public class Intent {
    public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000;

    public Intent(String action) {
    }

    public Intent addFlags(int flags) {
        return this;
    }

    public Intent putExtra(String key, String value) {
        return this;
    }
}
