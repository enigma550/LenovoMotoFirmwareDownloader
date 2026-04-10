## Android helper

This subsystem is the real on-device writer for backup restore.

- `lmfd_restore_helper.apk` restores `contacts` and `messages`
- `runtime/bun/features/backup-restore/on-device/system-prompt/` is only a small system-flow helper
- the DEX helper can open the default SMS prompt when shell role assignment is not enough

Current model:

1. backup data is read from the snapshot on desktop
2. helper payload is pushed to the device
3. the helper APK performs provider writes with real app identity
4. SMS restore may require temporary default SMS-role handling

Local test fallback:

- normal runtime path does not require CLI `adb`
- for local debugging only, you can force CLI `adb` with:
  - `LMFD_FORCE_CLI_ADB=1`
  - `LMFD_ADB_EXECUTABLE=/path/to/adb`

Those env vars are for local testing and device-debugging only. They are not part of the normal dependency model.
