import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { BrowserView, BrowserWindow, BuildConfig, Updater, Utils } from 'electrobun/bun';
import type { DesktopRpcSchema, DownloadProgressMessage } from '../shared/desktop-rpc';
import { cleanupLinuxCefProfileLocks } from './cef-profile.ts';
import { createRequestHandlers } from './rpc/create-request-handlers.ts';

const DOWNLOAD_RPC_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const CEF_VIEW_SERVER_PORT_START = 56000;
const CEF_VIEW_SERVER_PORT_END = 56020;
const INSTANCE_PID_PATH = join(tmpdir(), 'lenovo-moto-firmware-downloader.pid');

type MutableBrowserWindow = BrowserWindow & {
  webviewId: number;
};

type RemovableBrowserView = {
  id: number;
  remove(): void;
};

function registerSingleInstancePidFile() {
  const pidValue = String(process.pid);
  try {
    writeFileSync(INSTANCE_PID_PATH, pidValue, 'utf8');
  } catch (error) {
    console.warn('[AuthCallback] Could not create pid lock file for protocol handoff.', error);
    return;
  }

  process.on('exit', () => {
    try {
      if (!existsSync(INSTANCE_PID_PATH)) return;
      const currentValue = readFileSync(INSTANCE_PID_PATH, 'utf8').trim();
      if (currentValue === pidValue) {
        unlinkSync(INSTANCE_PID_PATH);
      }
    } catch {
      // Ignore cleanup failures.
    }
  });
}

registerSingleInstancePidFile();

// Log all updater status changes to the console for easier remote debugging
Updater.onStatusChange((entry) => {
  console.log(`[Updater Status] ${entry.status}: ${entry.message}`, entry.details || '');
});

let mainWindowRef: BrowserWindow | null = null;

const requestHandlers = createRequestHandlers({
  sendDownloadProgress: (payload) => {
    sendDownloadProgress(payload);
  },
  getMainWindow: () => mainWindowRef,
  getMainWindowUrl: () => mainWindowUrl,
});

const rpc = BrowserView.defineRPC<DesktopRpcSchema>({
  maxRequestTime: DOWNLOAD_RPC_TIMEOUT_MS,
  handlers: {
    requests: requestHandlers,
    messages: {},
  },
});

type BunHttpServer = ReturnType<typeof Bun.serve>;

let cefViewServer: BunHttpServer | null = null;

function getCefViewRoot() {
  return resolve(process.cwd(), '..', 'Resources', 'app', 'views', 'mainview', 'browser');
}

function getMimeType(pathname: string) {
  switch (extname(pathname).toLowerCase()) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.ico':
      return 'image/x-icon';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function startLinuxCefViewServer() {
  if (process.platform !== 'linux') {
    return null;
  }

  if (cefViewServer) {
    return cefViewServer;
  }

  const viewRoot = getCefViewRoot();
  const viewRootPrefix = `${viewRoot}${sep}`;

  for (let port = CEF_VIEW_SERVER_PORT_START; port <= CEF_VIEW_SERVER_PORT_END; port += 1) {
    try {
      cefViewServer = Bun.serve({
        hostname: '127.0.0.1',
        port,
        fetch: async (request) => {
          const url = new URL(request.url);
          const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
          const relativePath = pathname.replace(/^\/+/, '');
          const resolvedPath = resolve(viewRoot, relativePath);

          if (resolvedPath !== viewRoot && !resolvedPath.startsWith(viewRootPrefix)) {
            return new Response('Forbidden', { status: 403 });
          }

          const file = Bun.file(resolvedPath);
          if (!(await file.exists())) {
            return new Response('Not found', { status: 404 });
          }

          return new Response(file, {
            headers: {
              'content-type': getMimeType(resolvedPath),
              'cache-control': 'no-cache',
            },
          });
        },
      });

      console.log(`[CEF] Serving main view from ${cefViewServer.url.origin}`);
      return cefViewServer;
    } catch (error) {
      if ((error as { code?: string }).code === 'EADDRINUSE') {
        continue;
      }

      console.error('[CEF] Failed to start local view server.', error);
      return null;
    }
  }

  console.error('[CEF] No free port available for local view server.');
  return null;
}

function nudgeLinuxCefPaint(mainWindow: BrowserWindow) {
  if (process.platform !== 'linux') {
    return;
  }

  const { width, height } = mainWindow.frame;
  if (width <= 10 || height <= 10) {
    return;
  }

  setTimeout(() => {
    mainWindow.setSize(width - 1, height);
    setTimeout(() => {
      mainWindow.setSize(width, height);
      mainWindow.focus();
    }, 40);
  }, 80);
}

function replaceLinuxCefMainWebview(mainWindow: BrowserWindow, url: string) {
  if (process.platform !== 'linux' || selectedRenderer !== 'cef') {
    return;
  }

  const mutableMainWindow = mainWindow as MutableBrowserWindow;
  const defaultWebview = mutableMainWindow.webview as unknown as RemovableBrowserView;
  defaultWebview.remove();

  const replacementWebview = new BrowserView({
    url,
    preload: 'views://bridge/index.js',
    rpc,
    renderer: 'cef',
    partition: 'ephemeral',
    frame: {
      x: 0,
      y: 0,
      width: mutableMainWindow.frame.width,
      height: mutableMainWindow.frame.height,
    },
    windowId: mutableMainWindow.id,
  });

  mutableMainWindow.webviewId = replacementWebview.id;
}

type DownloadProgressPayload = DownloadProgressMessage;
type DownloadProgressSendFn = (
  message: 'downloadProgress',
  payload: DownloadProgressPayload,
) => void;

function sendDownloadProgress(payload: DownloadProgressPayload) {
  const sendRpcMessage = rpc.send as DownloadProgressSendFn;
  sendRpcMessage('downloadProgress', payload);
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

if (selectedRenderer === 'cef' && process.platform === 'linux') {
  await cleanupLinuxCefProfileLocks(Utils.paths.userCache);
}

const cefViewServerUrl =
  selectedRenderer === 'cef' && process.platform === 'linux'
    ? startLinuxCefViewServer()?.url.origin
    : null;
const mainWindowUrl = cefViewServerUrl
  ? `${cefViewServerUrl}/index.html`
  : 'views://mainview/browser/index.html';

const mainWindow = new BrowserWindow({
  title: 'Lenovo Moto Firmware Downloader',
  url: mainWindowUrl,
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
mainWindowRef = mainWindow;
replaceLinuxCefMainWebview(mainWindow, mainWindowUrl);

mainWindow.webview.on('did-navigate', () => {
  mainWindow.maximize();
  nudgeLinuxCefPaint(mainWindow);
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
