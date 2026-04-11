import type { ElectrobunConfig } from "electrobun";

const linuxRendererEnv = (
  process.env.LE_MOTO_RENDERER_LINUX || "cef"
).toLowerCase();
const linuxRenderer: "native" | "cef" =
  linuxRendererEnv === "native" ? "native" : "cef";
const buildEnvironment = (
  process.env.ELECTROBUN_BUILD_ENV || "dev"
).toLowerCase();

function resolveReleaseBaseUrl() {
  if (buildEnvironment === "stable") {
    return "https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/latest/download/";
  }

  if (buildEnvironment === "canary") {
    return "https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/download/canary/";
  }

  return "";
}

function shouldGenerateReleasePatch() {
  if (buildEnvironment !== "stable" && buildEnvironment !== "canary") {
    return false;
  }

  return process.platform !== "linux";
}

export default {
  app: {
    name: "LMFD",
    identifier: "com.github.enigma550.lenovomotofirmwaredownloader",
    version: "0.0.3",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  scripts: {
    postBuild: "tooling/build/finalize-app.ts",
    postPackage: "tooling/build/finalize-installer.ts",
  },
  build: {
    mac: {
      bundleCEF: false,
      defaultRenderer: "native",
      icons: "assets/icons/icon.iconset",
    },
    win: {
      bundleCEF: false,
      defaultRenderer: "native",
      // icon: "assets/icons/windows-icon.ico",
    },
    linux: {
      bundleCEF: linuxRenderer === "cef",
      defaultRenderer: linuxRenderer,
      icon: "assets/icons/icon.iconset/icon_512x512.png",
    },
    bun: {
      entrypoint: "runtime/bun/index.ts",
      external: ["usb"],
    },
    views: {
      bridge: {
        entrypoint: "runtime/bridge/index.ts",
      },
    },
    copy: {
      "runtime/views/mainview": "views/mainview",
      "assets/tools": "tools",
      "runtime/bun/features/backup-restore/on-device/restore-helper/lmfd_restore_helper.apk":
        "bun/lmfd_restore_helper.apk",
      "runtime/bun/features/backup-restore/on-device/system-prompt/system_prompt_helper.dex":
        "bun/system_prompt_helper.dex",
    },
  },
  release: {
    // Linux is distributed as DwarFS AppImage + zsync metadata, so Electrobun's
    // delta patch generation is unnecessary there and just adds build overhead.
    generatePatch: shouldGenerateReleasePatch(),
    baseUrl: resolveReleaseBaseUrl(),
  },
} satisfies ElectrobunConfig;
