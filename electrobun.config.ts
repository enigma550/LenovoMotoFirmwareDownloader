import { app, BrowserWindow, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Cấu hình biến toàn cục chuẩn chỉ
let win = null; 
let pendingCallbackUrl = null;

// Đăng ký Custom Scheme để macOS hiểu "softwarefix://" thuộc về app này
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('softwarefix', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('softwarefix');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }
]);

function checkStoredTokenStatus() {
  try {
    const configPath = path.join(process.cwd(), 'assets/data/config.json');
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Boolean(configData.authorizationToken?.trim());
    }
  } catch (e) {}
  return false;
}

function getRealLenovoLoginUrl() {
  try {
    console.log('-> [Electron] Đang nhờ Bun lấy URL đăng nhập...');
    const scriptPath = path.join(process.cwd(), 'core/features/auth/login.ts');
    const bunCommand = `bun -e "import { createLoginUrl } from '${scriptPath}'; console.log(await createLoginUrl());"`;
    const realLoginUrl = execSync(bunCommand).toString().trim();
    console.log('-> [Electron] ĐÃ LẤY ĐƯỢC LINK CHÍNH CHỦ TỪ LENOVO:', realLoginUrl);
    return realLoginUrl;
  } catch (error) {
    return 'https://passport.lenovo.com/passport/remote/login.html?config=softwarefix';
  }
}

function openAuthPopupWindow(parentWindow, loginUrl) {
  // Kiểm tra nếu cửa sổ cũ chưa bị hủy thì mới tương tác để né lỗi "Object has been destroyed"
  if (!win || win.webContents.isDestroyed()) return;

  const authWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    parent: parentWindow,
    modal: true,
    title: 'Lenovo Login (Software Fix Mode)',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  authWindow.loadURL(loginUrl);

  const handleAuthRedirect = (redirectUrl) => {
    if (redirectUrl.startsWith('softwarefix://callback') || redirectUrl.includes('api/auth/callback')) {
      console.log('🎉 [Electron] ĐÃ TÓM ĐƯỢC LINK HỒI HƯỚNG CHỨA TOKEN:', redirectUrl);
      
      pendingCallbackUrl = redirectUrl;
      
      // Kiểm tra an toàn trước khi đóng cửa sổ con để triệt hạ lỗi văng exception khi spam
      if (authWindow && !authWindow.isDestroyed() && !authWindow.webContents.isDestroyed()) {
        setTimeout(() => { 
          if (!authWindow.isDestroyed()) authWindow.close(); 
        }, 50);
      }

      try {
        const urlObj = new URL(redirectUrl.replace('softwarefix://', 'http://'));
        const rawToken = urlObj.searchParams.get('Authorization');
        
        if (rawToken) {
          const finalToken = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;
          console.log('💎 [Electron] Đã trích xuất được Token xịn:', finalToken);

          const dataDir = path.join(process.cwd(), 'assets/data');
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

          const configPath = path.join(dataDir, 'config.json');
          let currentConfig = {};
          if (fs.existsSync(configPath)) {
            try { currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
          }
          
          currentConfig.authorizationToken = finalToken;
          fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
          console.log('✅ [Electron] Đã ghi cứng Token thành công vào assets/data/config.json!');
        }
      } catch (err) {
        console.error('Lỗi khi bóc tách token:', err.message);
      }
    }
  };

  authWindow.webContents.on('will-navigate', (event, url) => handleAuthRedirect(url));
  authWindow.webContents.on('will-redirect', (event, url) => handleAuthRedirect(url));
}

function createWindow() {
  const preloadPath = path.join(process.cwd(), 'preload-bridge.cjs');
  fs.writeFileSync(preloadPath, `
    window.isDesktopMode = true;
    window.__electrobun_web_view_id__ = 1;
    window.__electrobun_rpc_router__ = { reply: function() {} };
    
    // Mồi sẵn Object thô ngay từ khi nạp trang để Angular reference cứng vào đây
    window.desktopApi = {
      isDesktop: true,
      startAuth: () => Promise.resolve({ ok: true, openedInExternalBrowser: true }),
      startInAppAuth: () => Promise.resolve({ ok: true, openedInExternalBrowser: true }),
      getStoredAuthState: () => Promise.resolve({ ok: true, hasStoredAuthorizationToken: true, hasToken: true }),
      consumePendingAuthCallback: () => {
        // Hàm này sẽ được cấu hình gọi ngầm qua luồng HTTP Protocol bên dưới để đảm bảo đồng bộ
        return Promise.resolve(null);
      },
      completeAuth: () => Promise.resolve({ ok: true, error: null }),
      authWithStoredToken: () => Promise.resolve({ ok: true, error: null }),
      checkDesktopIntegration: () => Promise.resolve({ ok: true, isIntegrated: true }),
      getDesktopPromptPreference: () => Promise.resolve(true),
      checkFrameworkUpdate: () => Promise.resolve({ ok: true, hasUpdate: false }),
      getAppInfo: () => Promise.resolve({ ok: true, platform: 'darwin', version: '1.0.0' }),
      ping: () => Promise.resolve({ ok: true })
    };
  `, 'utf8');

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: preloadPath
    },
  });

  // 🎯 ĐƯỜNG ỐNG CHIẾN THUẬT: Đón lỏng và nhả token trực tiếp khi Angular phát request tra cứu
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: corsHeaders });
    }

    if (pathname.includes('/api/auth/start')) {
      setTimeout(() => { openAuthPopupWindow(win, getRealLenovoLoginUrl()); }, 0);
      return new Response(JSON.stringify({ ok: true, openedInExternalBrowser: true }), { headers: corsHeaders });
    }

    if (pathname.includes('/api/auth/state') || pathname.includes('getStoredAuthState')) {
      const hasToken = checkStoredTokenStatus();
      return new Response(JSON.stringify({ ok: true, hasStoredAuthorizationToken: hasToken, hasToken: hasToken }), { headers: corsHeaders });
    }

    // KHÓA CHẾT VÒNG LẶP TUẦN TRA: Trả thẳng cấu trúc Object chuẩn mà mapPendingAuthCallbackResponse thèm khát!
    if (pathname.includes('consumePendingAuthCallback') || pathname.includes('/api/auth/callback') || pathname.includes('callback')) {
      const callbackToSend = pendingCallbackUrl;
      if (pendingCallbackUrl) {
        console.log('🔥 [Protocol Long Mạch] Đã tuồn thành công token vào vòng lặp tuần tra của Angular!');
        pendingCallbackUrl = null; // Reset sau khi dùng
      }

      // Trả về cả hai định dạng cấu trúc (cho cả luồng Web lẫn luồng Bridge) để bao vây hoàn toàn
      return new Response(JSON.stringify({
        ok: Boolean(callbackToSend),
        callbackUrlOrToken: callbackToSend,
        url: callbackToSend,
        token: callbackToSend
      }), { headers: corsHeaders });
    }

    if (pathname.includes('completeAuth') || pathname.includes('/api/auth/complete') || pathname.includes('authWithStoredToken')) {
      return new Response(JSON.stringify({ ok: true, error: null }), { headers: corsHeaders });
    }

    if (pathname.includes('config.json')) {
      try {
        const activeConfigPath = path.join(process.cwd(), 'assets/data/config.json');
        if (fs.existsSync(activeConfigPath)) {
          return new Response(fs.readFileSync(activeConfigPath), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
      } catch (e) {}
    }

    try {
      const filePath = path.join(process.cwd(), 'web/dist/web/browser', pathname);
      let mimeType = 'text/html';
      if (pathname.endsWith('.js')) mimeType = 'text/javascript';
      else if (pathname.endsWith('.css')) mimeType = 'text/css';

      return new Response(fs.readFileSync(filePath), {
        headers: { 'Content-Type': mimeType, 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {
      return new Response('File Not Found', { status: 404 });
    }
  });

  win.loadURL('app://localhost/');
}

// Hứng sự kiện hệ điều hành ném link về app khi nháy sáng trên Mac
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('🚀 [macOS] Hệ điều hành chuyển giao link hồi hướng về app:', url);
  pendingCallbackUrl = url;
});

app.whenReady().then(() => { createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });