import {
  resetConnectedDeviceConnection,
  waitForConnectedDeviceAvailability,
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
  const attemptReboot = async (label: string, reuseShared = true) => {
    await withConnectedDeviceConnection(
      async (connection) => {
        await connection.adb.power.reboot('edl');
      },
      { label, reuseShared: reuseShared ? undefined : false },
    );
  };

  try {
    await attemptReboot('rescue:reboot-to-edl');
    await resetConnectedDeviceConnection().catch(() => {});

    return {
      ok: true,
      detail: 'Sent reboot edl via Tango ADB.',
    };
  } catch (firstError) {
    const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
    await resetConnectedDeviceConnection().catch(() => {});

    if (isExpectedDisconnectAfterReboot(firstMessage)) {
      return {
        ok: true,
        detail: 'Sent reboot edl via Tango ADB. Device disconnected as expected.',
      };
    }

    try {
      if (process.platform === 'win32') {
        await Bun.sleep(1_500);
      }

      await waitForConnectedDeviceAvailability({
        timeoutMs: process.platform === 'win32' ? 25_000 : 6_000,
        label: 'rescue:reboot-to-edl:wait-for-device',
      }).catch(() => {});

      await attemptReboot('rescue:reboot-to-edl:retry', false);
      await resetConnectedDeviceConnection().catch(() => {});

      return {
        ok: true,
        detail: 'Sent reboot edl via Tango ADB after reconnect retry.',
      };
    } catch (secondError) {
      const secondMessage =
        secondError instanceof Error ? secondError.message : String(secondError);
      await resetConnectedDeviceConnection().catch(() => {});

      if (isExpectedDisconnectAfterReboot(secondMessage)) {
        return {
          ok: true,
          detail: 'Sent reboot edl via Tango ADB. Device disconnected as expected.',
        };
      }

      return {
        ok: false,
        error: secondMessage || firstMessage,
      };
    }
  }
}
