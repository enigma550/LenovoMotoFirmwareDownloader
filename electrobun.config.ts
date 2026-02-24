import type { ElectrobunConfig } from "electrobun";

const linuxRendererEnv = (
  process.env.LE_MOTO_RENDERER_LINUX || "cef"
).toLowerCase();
const linuxRenderer: "native" | "cef" =
  linuxRendererEnv === "native" ? "native" : "cef";

export default {
  app: {
    name: "LMFD",
    identifier: "com.github.enigma550.lenovomotofirmwaredownloader",
    version: "0.0.1",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  scripts: {
    postBuild: "scripts/finalize-app.ts",
    postPackage: "scripts/finalize-installer.ts",
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
    },
    views: {
      bridge: {
        entrypoint: "runtime/bridge/index.ts",
      },
    },
    copy: {
      "runtime/views/mainview": "views/mainview",
    },
  },
  release: {
    // Linux is distributed as DwarFS AppImage + zsync metadata, so Electrobun's
    // delta patch generation is unnecessary there and just adds build overhead.
    generatePatch: process.platform !== "linux",
    baseUrl: "https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/latest/download/", // Patched during build
  },
} satisfies ElectrobunConfig;
