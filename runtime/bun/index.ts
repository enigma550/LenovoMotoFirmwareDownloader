import { BrowserView, BrowserWindow, BuildConfig, Updater, Utils } from 'electrobun/bun';
import type { DesktopRpcSchema, DownloadProgressMessage } from '../shared/rpc.ts';
import { cleanupLinuxCefProfileLocks } from './cef-profile.ts';
import { createRequestHandlers } from './handlers/create-request-handlers.ts';

const DOWNLOAD_RPC_TIMEOUT_MS = 6 * 60 * 60 * 1000;

// Log all updater status changes to the console for easier remote debugging
Updater.onStatusChange((entry) => {
  console.log(`[Updater Status] ${entry.status}: ${entry.message}`, entry.details || '');
});

const requestHandlers = createRequestHandlers({
  sendDownloadProgress: (payload) => {
    sendDownloadProgress(payload);
  },
});

const rpc = BrowserView.defineRPC<DesktopRpcSchema>({
  maxRequestTime: DOWNLOAD_RPC_TIMEOUT_MS,
  handlers: {
    requests: requestHandlers,
    messages: {},
  },
});

type DownloadProgressPayload = DownloadProgressMessage;
type DownloadProgressSendFn = (
  message: 'downloadProgress',
  payload: DownloadProgressPayload,
) => void;

function sendDownloadProgress(payload: DownloadProgressPayload) {
  (rpc.send as unknown as DownloadProgressSendFn)('downloadProgress', payload);
}

const buildConfig = await BuildConfig.get();
const rendererOptions = new Set(buildConfig.availableRenderers || []);
const requestedLinuxRenderer = (Bun.env.LE_MOTO_RENDERER_LINUX || '').toLowerCase();

let selectedRenderer: 'native' | 'cef' = buildConfig.defaultRenderer;
if (process.platform === 'linux' && requestedLinuxRenderer) {
  if (requestedLinuxRenderer === 'native' && rendererOptions.has('native')) {
    selectedRenderer = 'native';
  } else if (requestedLinuxRenderer === 'cef' && rendererOptions.has('cef')) {
    selectedRenderer = 'cef';
  } else {
    console.warn(
      `[Renderer] Requested '${requestedLinuxRenderer}' is unavailable in this build. Using '${selectedRenderer}'.`,
    );
  }
}

if (selectedRenderer === 'cef') {
  await cleanupLinuxCefProfileLocks(Utils.paths.userCache);
}

const mainWindow = new BrowserWindow({
  title: 'Lenovo Moto Firmware Downloader',
  url: 'views://mainview/browser/index.html',
  preload: 'views://bridge/index.js',
  rpc,
  renderer: selectedRenderer,
  frame: {
    width: 1600,
    height: 900,
    x: 50,
    y: 30,
  },
});
mainWindow.webview.on('did-navigate', () => {
  mainWindow.maximize();
});

if (process.platform === 'win32') {
  const fs = require('node:fs');
  const path = require('node:path');

  // In development, the icon is in assets/icons.
  // In production (bundled), the icon is extracted to Resources/app.ico
  const candidates = [
    path.join(process.cwd(), 'assets/icons/windows-icon.ico'), // Development
    path.join(process.argv[0], '..', '..', 'Resources', 'app.ico'), // Production
    path.join(process.execPath, '..', '..', 'Resources', 'app.ico'), // Production fallback
  ];

  let iconPath = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      iconPath = c;
      break;
    }
  }

  if (mainWindow.ptr && iconPath) {
    try {
      const { dlopen, FFIType } = require('bun:ffi');
      const user32 = dlopen('user32.dll', {
        ['FindWindowW']: {
          args: [FFIType.ptr, FFIType.ptr],
          returns: FFIType.ptr,
        },
        ['LoadImageW']: {
          args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
          returns: FFIType.ptr,
        },
        ['SendMessageW']: {
          args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
          returns: FFIType.ptr,
        },
      });

      const toUtf16le = (str: string) => {
        const buf = Buffer.alloc((str.length + 1) * 2);
        buf.write(str, 0, 'utf16le');
        return buf;
      };

      // Set a small delay to ensure the window is drawn before we find it
      setTimeout(() => {
        const titlePtr = toUtf16le('Lenovo Moto Firmware Downloader');
        const hwnd = user32.symbols.FindWindowW(null, titlePtr);
        if (hwnd) {
          const iconPtr = toUtf16le(iconPath);
          // IMAGE_ICON = 1, LR_LOADFROMFILE = 0x00000010
          const hIcon = user32.symbols.LoadImageW(null, iconPtr, 1, 0, 0, 0x00000010);
          if (hIcon) {
            // WM_SETICON = 0x0080, ICON_SMALL = 0, ICON_BIG = 1
            user32.symbols.SendMessageW(hwnd, 0x0080, 0, hIcon);
            user32.symbols.SendMessageW(hwnd, 0x0080, 1, hIcon);
          } else {
            console.error('WINDOW ICON: Failed to load icon image via Win32.');
          }
        } else {
          console.error('WINDOW ICON: Failed to find window HWND.');
        }
      }, 500);
    } catch (err) {
      console.error('WINDOW ICON SET ERROR:', err);
    }
  }
}
