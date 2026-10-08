import { FastbootClient } from 'fastboot-bun-ts/fastboot';
import { listFastbootDevices } from 'fastboot-bun-ts/usb';

export type FastbootDeviceHealth = {
  ok: boolean;
  connected: boolean;
  serialNumber?: string;
  product?: string;
  batteryLevel?: string;
  batteryVoltage?: string;
  batteryStatus: 'ok' | 'low' | 'unknown';
  unlocked?: boolean;
  secure?: boolean;
  warnings: string[];
};

export async function probeFastbootDeviceHealth(): Promise<FastbootDeviceHealth> {
  const warnings: string[] = [];

  let devices: ReturnType<typeof listFastbootDevices> extends Promise<infer T> ? T : never = [];
  try {
    devices = await listFastbootDevices();
  } catch {
    return {
      ok: false,
      connected: false,
      batteryStatus: 'unknown',
      warnings: ['Não foi possível listar dispositivos Fastboot no momento.'],
    };
  }

  if (!devices || devices.length === 0) {
    return {
      ok: true,
      connected: false,
      batteryStatus: 'unknown',
      warnings: ['Nenhum dispositivo detectado em modo Fastboot via USB.'],
    };
  }

  const targetDevice = devices[0];
  if (!targetDevice) {
    return {
      ok: true,
      connected: false,
      batteryStatus: 'unknown',
      warnings: ['Nenhum dispositivo disponível.'],
    };
  }

  let client: FastbootClient | null = null;
  let serialNumber = targetDevice.serialNumber || '';
  let product = targetDevice.product || '';
  let batteryLevel = '';
  let batteryVoltage = '';
  let batteryStatus: 'ok' | 'low' | 'unknown' = 'unknown';
  let unlocked: boolean | undefined;
  let secure: boolean | undefined;

  try {
    client = await FastbootClient.connect({
      serial: serialNumber || undefined,
      confirmPrivilegedFix: async () => true,
    });

    const readVar = async (name: string): Promise<string> => {
      try {
        return (await client?.getVar(name)) || '';
      } catch {
        return '';
      }
    };

    product = (await readVar('product')) || product;
    serialNumber = (await readVar('serialno')) || serialNumber;
    batteryLevel = await readVar('battery-level');
    batteryVoltage = await readVar('battery-voltage');
    const unlockedRaw = await readVar('unlocked');
    const secureRaw = await readVar('secure');

    if (unlockedRaw) {
      unlocked = unlockedRaw === 'yes' || unlockedRaw === 'true';
    }
    if (secureRaw) {
      secure = secureRaw === 'yes' || secureRaw === 'true';
    }

    // Evaluate battery level
    const numericLevel = parseInt(batteryLevel.replace('%', ''), 10);
    const numericVoltage = parseInt(batteryVoltage.replace('mV', '').replace('mv', ''), 10);

    if (!Number.isNaN(numericLevel)) {
      if (numericLevel < 30) {
        batteryStatus = 'low';
        warnings.push(
          `Nível de bateria baixo (${numericLevel}%). Conecte o carregador antes de realizar a gravação.`,
        );
      } else {
        batteryStatus = 'ok';
      }
    } else if (!Number.isNaN(numericVoltage)) {
      if (numericVoltage < 3500) {
        batteryStatus = 'low';
        warnings.push(
          `Tensão da bateria baixa (${numericVoltage} mV). Recomenda-se carregar antes de prosseguir.`,
        );
      } else {
        batteryStatus = 'ok';
      }
    } else if (
      batteryLevel.toLowerCase().includes('ok') ||
      batteryVoltage.toLowerCase().includes('ok')
    ) {
      batteryStatus = 'ok';
    }
  } catch (err) {
    warnings.push(
      `Erro ao consultar variáveis do dispositivo: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  return {
    ok: true,
    connected: true,
    serialNumber,
    product,
    batteryLevel,
    batteryVoltage,
    batteryStatus,
    unlocked,
    secure,
    warnings,
  };
}
