import { $ } from "bun";
import { environmentVariables } from "../lmsa/state.ts";
import type { DeviceInfo } from "../../shared/types/index.ts";

async function commandExists(commandName: string) {
  const response = await $`which ${commandName}`.quiet().nothrow();
  return response.exitCode === 0;
}

export async function getDeviceToolAvailability() {
  const [adbAvailable, fastbootAvailable] = await Promise.all([
    commandExists("adb"),
    commandExists("fastboot"),
  ]);

  return {
    adbAvailable,
    fastbootAvailable,
  };
}

async function getImeiFromAdb() {
  await $`adb root`.quiet().nothrow();
  const response =
    await $`adb shell service call iphonesubinfo 1 s16 "com.android.shell"`
      .quiet()
      .nothrow();

  const output = response.stdout.toString();
  const matches = output.match(/'([^']+)'/g);
  if (!matches) return "";

  const rawHex = matches.join("");
  const cleanImei = rawHex.replace(/[^0-9]/g, "");
  return cleanImei.substring(0, 15);
}

async function getFastbootValue(key: string) {
  const response = await $`fastboot getvar ${key}`.quiet().nothrow();
  const stderrOutput = response.stderr.toString();
  const match = stderrOutput.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

export async function getDeviceInfo() {
  const adbStateResponse = await $`adb get-state`.quiet().nothrow();
  const adbStatus = adbStateResponse.stdout.toString();

  if (adbStatus.includes("device")) {
    console.log("[INFO] Device detected via ADB...");
    const propertiesResponse = await $`adb shell getprop`.quiet().nothrow();
    const propertiesText = propertiesResponse.stdout.toString();

    const properties = new Map(
      propertiesText
        .split("\n")
        .map((line) => line.match(/\[([^\]]+)\]: \[([^\]]+)\]/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]]),
    );

    const imei = environmentVariables.LMSA_IMEI || (await getImeiFromAdb());

    return {
      imei,
      modelName:
        environmentVariables.LMSA_MODEL_NAME ||
        properties.get("ro.product.model") ||
        "Motorola Device",
      modelCode:
        environmentVariables.LMSA_MODEL_CODE ||
        properties.get("ro.boot.hardware.sku") ||
        properties.get("ro.build.product") ||
        "",
      sn: environmentVariables.LMSA_SN || properties.get("ro.serialno") || "",
      roCarrier:
        environmentVariables.LMSA_RO_CARRIER ||
        properties.get("ro.carrier") ||
        "reteu",
    } as DeviceInfo;
  }

  console.log("[INFO] ADB not active. Falling back to targeted Fastboot...");

  return {
    imei: environmentVariables.LMSA_IMEI || (await getFastbootValue("imei")),
    modelName:
      environmentVariables.LMSA_MODEL_NAME ||
      (await getFastbootValue("product")),
    modelCode:
      environmentVariables.LMSA_MODEL_CODE || (await getFastbootValue("sku")),
    sn: environmentVariables.LMSA_SN || (await getFastbootValue("serialno")),
    roCarrier:
      environmentVariables.LMSA_RO_CARRIER ||
      (await getFastbootValue("ro.carrier")) ||
      "reteu",
  } as DeviceInfo;
}
