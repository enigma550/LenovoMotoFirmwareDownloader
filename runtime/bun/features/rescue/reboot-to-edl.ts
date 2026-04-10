import {
  resetConnectedDeviceConnection,
  withConnectedDeviceConnection,
} from '../../device/connected-device-facade.ts';

function isExpectedDisconnectAfterReboot(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('closed') ||
    lower.includes('disconnect') ||
    lower.includes('broken pipe') ||
    lower.includes('connection reset') ||
    lower.includes('eof') ||
    lower.includes('no device')
  );
}

export async function rebootConnectedDeviceToEdl() {
  try {
    await withConnectedDeviceConnection(
      async (connection) => {
        await connection.adb.power.reboot('edl');
      },
      { label: 'rescue:reboot-to-edl' },
    );

    await resetConnectedDeviceConnection().catch(() => {});

    return {
      ok: true,
      detail: 'Sent reboot edl via Tango ADB.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await resetConnectedDeviceConnection().catch(() => {});

    if (isExpectedDisconnectAfterReboot(message)) {
      return {
        ok: true,
        detail: 'Sent reboot edl via Tango ADB. Device disconnected as expected.',
      };
    }

    return {
      ok: false,
      error: message,
    };
  }
}
