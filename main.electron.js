import { app, BrowserWindow, protocol, shell, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';

// ===== GHI LOG RA FILE =====
const logFile = path.join(process.cwd(), 'debug-log.txt');
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage, 'utf8');
  console.log(message);
}
// ===========================

// ===== LƯU SESSION TOÀN CỤC =====
let globalSession = {
  jwt: '',
  guid: '',
  clientUuid: '',
  cookieJar: new Map()
};

let win = null; 
let pendingCallbackUrl = null;
let isFirstLoad = true;

// ===== API CLIENT TỪ DỰ ÁN GỐC =====
const API_URL = 'https://lsa.lenovo.com/Interface';
const BASE_URL = 'https://lsa.lenovo.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.79 Safari/537.36';
const clientVersion = '7.5.5.19';
const requestLanguage = 'en-US';
const requestWindowsInfo = 'Microsoft Windows 10 Pro, 64-bit';

function serializeCookies() {
  return [...globalSession.cookieJar.entries()]
    .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
    .join('; ');
}

function getSetCookieValues(headers) {
  const setCookieValue = headers.get('set-cookie');
  return setCookieValue ? [setCookieValue] : [];
}

function updateCookies(headers) {
  for (const cookieLine of getSetCookieValues(headers)) {
    const [cookiePair] = cookieLine.split(';');
    if (!cookiePair) continue;

    const splitAt = cookiePair.indexOf('=');
    if (splitAt <= 0) continue;

    const cookieName = cookiePair.slice(0, splitAt).trim();
    const cookieValue = cookiePair.slice(splitAt + 1).trim();
    if (cookieName && cookieValue) {
      globalSession.cookieJar.set(cookieName, cookieValue);
    }
  }
}

function refreshAuth(headers) {
  const authorizationHeader = headers.get('Authorization');
  const responseGuid = headers.get('Guid');
  if (!authorizationHeader) return;
  if (responseGuid && responseGuid !== globalSession.guid) return;

  globalSession.jwt = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader
    : `Bearer ${authorizationHeader}`;
}

async function bootstrapSessionCookie() {
  try {
    const response = await fetch(`${BASE_URL}/lmsa-web/index.jsp`, { redirect: 'manual' });
    updateCookies(response.headers);
    writeLog('✅ [Bootstrap] Session cookie bootstrapped');
  } catch (e) {
    writeLog(`❌ [Bootstrap] Error: ${e.message}`);
  }
}

async function requestApi(path, body = {}, options = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const isFormUrlEncoded = options.headers?.['Content-Type'] === 'application/x-www-form-urlencoded';

  const headers = new Headers({
    'Content-Type': options.headers?.['Content-Type'] || 'application/json',
    'Request-Tag': 'lmsa',
    'User-Agent': USER_AGENT,
    'Guid': globalSession.guid || '',
    'Cookie': serializeCookies(),
    'clientVersion': clientVersion,
    'language': requestLanguage,
    'windowsInfo': Buffer.from(requestWindowsInfo).toString('base64'),
  });

  if (globalSession.clientUuid) {
    headers.set('clientUUID', globalSession.clientUuid);
  }

  if (!options.withoutAuth && globalSession.jwt) {
    headers.set('Authorization', globalSession.jwt);
  }

  const payload = options.raw
    ? body
    : {
        client: {
          version: clientVersion,
        },
        language: requestLanguage,
        windowsInfo: requestWindowsInfo,
        dparams: body,
      };

  const isGet = (options.method || 'POST').toUpperCase() === 'GET';

  let requestBody = null;
  if (!isGet) {
    if (isFormUrlEncoded) {
      const formBody = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value === null || value === undefined) continue;
        formBody.set(key, String(value));
      }
      requestBody = formBody;
    } else {
      requestBody = JSON.stringify(payload);
    }
  }

  writeLog(`📡 [API] ${options.method || 'POST'} ${url}`);
  if (requestBody) {
    writeLog(`📦 [API] Body: ${requestBody.substring(0, 500)}`);
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers,
      body: requestBody,
    });

    updateCookies(response.headers);
    refreshAuth(response.headers);
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const responseData = await response.json();
      writeLog(`✅ [API] Response: ${JSON.stringify(responseData).substring(0, 500)}`);
      return responseData;
    } else {
      const text = await response.text();
      writeLog(`⚠️ [API] Non-JSON response: ${text.substring(0, 200)}`);
      return { 
        code: 'ERROR', 
        desc: 'Invalid response format',
        raw: text 
      };
    }
  } catch (error) {
    writeLog(`❌ [API] Error: ${error.message}`);
    throw error;
  }
}

// ===== HÀM GENERATE ENCRYPT CODE =====
function generateEncryptCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ===== HÀM MAP FIRMWARE VARIANTS =====
function mapFirmwareVariants(content, selectedParameters) {
  const variants = [];
  if (!Array.isArray(content)) {
    return variants;
  }

  for (const item of content) {
    if (item.romResource) {
      const variant = {
        name: item.romResource.name || '',
        url: item.romResource.uri || '',
        publishDate: item.romResource.publishDate || '',
        romMatchId: item.romMatchId || '',
        flashFlow: item.flashFlow || '',
        parameters: selectedParameters || {},
        fileSize: item.romResource.fileSize || 0,
        fileSha1: item.romResource.fileSha1 || '',
        romVersion: item.romResource.romVersion || '',
        releaseDate: item.romResource.releaseDate || '',
        osVersion: item.romResource.osVersion || '',
        language: item.romResource.language || '',
        romResource: item.romResource,
        toolResource: item.toolResource,
        flashFlowUrl: item.flashFlow,
        modelName: item.modelName || '',
        realModelName: item.realModelName || '',
        carrier: item.carrier || '',
        marketName: item.marketName || '',
        platform: item.platform || '',
        fastboot: item.fastboot || false,
        backUpPopup: item.backUpPopup || false
      };
      
      // ===== LOG URL DOWNLOAD RA TERMINAL =====
      writeLog(`📥 [DOWNLOAD URL] ROM: ${variant.name}`);
      writeLog(`📥 [DOWNLOAD URL] ROM URL: ${variant.url}`);
      if (variant.flashFlowUrl) {
        writeLog(`📥 [DOWNLOAD URL] Flash Flow: ${variant.flashFlowUrl}`);
      }
      if (variant.toolResource?.uri) {
        writeLog(`📥 [DOWNLOAD URL] Tool: ${variant.toolResource.uri}`);
      }
      writeLog(`📥 [DOWNLOAD URL] ===== END =====`);
      
      variants.push(variant);
    }
  }

  return variants;
}

// ===== HÀM GET READ SUPPORT HINTS (TỪ DỰ ÁN GỐC) =====
async function getReadSupportHints(modelName) {
  writeLog(`🔍 [getReadSupportHints] Model: ${modelName}`);
  
  try {
    const response = await requestApi('/rescueDevice/getRomMatchParams.jhtml', {
      modelName: modelName
    });
    
    writeLog(`📦 [getReadSupportHints] Response: ${JSON.stringify(response)}`);
    
    const result = {
      code: response.code || '',
      desc: response.desc || '',
      content: {
        platform: response.content?.platform || '',
        params: Array.isArray(response.content?.params) 
          ? response.content.params.filter(p => typeof p === 'string')
          : [],
        modelName: response.content?.modelName || '',
        hints: response.content?.params || [],
        deviceInfo: response.content?.deviceInfo || null
      }
    };
    
    writeLog(`✅ [getReadSupportHints] Found hints for model: ${modelName}`);
    return result;
  } catch (error) {
    writeLog(`❌ [getReadSupportHints] Error: ${error.message}`);
    return {
      code: 'ERROR',
      desc: error.message,
      content: {
        platform: '',
        params: [],
        modelName: '',
        hints: [],
        deviceInfo: null
      }
    };
  }
}

// ===== HÀM LOOKUP READ SUPPORT BY IMEI (TỪ DỰ ÁN GỐC) =====
async function lookupReadSupportByImei(payload) {
  writeLog(`🔍 [lookupReadSupportByImei] Payload: ${JSON.stringify(payload)}`);
  
  try {
    const { imei, model, imei2, sn, roCarrier, channelId } = payload;
    
    const dparams = {
      imei: imei,
      modelCode: model?.modelName || model || '',
      roCarrier: roCarrier || 'reteu',
      encryptCode: generateEncryptCode(),
      sku: model?.modelName || model || '',
      carrierSku: model?.modelName || model || '',
    };

    if (imei2) {
      dparams.imei2 = imei2;
    }
    if (sn) {
      dparams.sn = sn;
    }
    if (channelId) {
      dparams.channelId = channelId;
    }

    writeLog(`📦 [lookupReadSupportByImei] Dparams: ${JSON.stringify(dparams)}`);

    const response = await requestApi('/rescueDevice/getNewResourceByImei.jhtml', dparams);
    
    writeLog(`📦 [lookupReadSupportByImei] Response: ${JSON.stringify(response)}`);

    const variants = mapFirmwareVariants(response?.content, {
      imei: imei,
      modelCode: model?.modelName || model || '',
      roCarrier: roCarrier || 'reteu',
    });

    const result = {
      code: response.code || '',
      desc: response.desc || '',
      content: {
        variants: variants,
        total: variants.length,
        modelName: model?.modelName || model || '',
        imei: imei,
        rawContent: response?.content || []
      }
    };

    writeLog(`✅ [lookupReadSupportByImei] Found ${variants.length} variants for IMEI: ${imei}`);
    
    // ===== GỬI KẾT QUẢ XUỐNG RENDERER =====
    if (win && !win.isDestroyed()) {
      win.webContents.send('lookup:result', result);
      writeLog(`📨 [lookupReadSupportByImei] Đã gửi kết quả xuống renderer`);
    }
    
    return result;
  } catch (error) {
    writeLog(`❌ [lookupReadSupportByImei] Error: ${error.message}`);
    const errorResult = {
      code: 'ERROR',
      desc: error.message,
      content: {
        variants: [],
        total: 0,
        modelName: '',
        imei: payload?.imei || '',
        rawContent: []
      }
    };
    
    if (win && !win.isDestroyed()) {
      win.webContents.send('lookup:error', errorResult);
      writeLog(`📨 [lookupReadSupportByImei] Đã gửi lỗi xuống renderer`);
    }
    
    return errorResult;
  }
}

// ===== HÀM GET MODEL NAMES =====
async function getModelNames(refresh = false) {
  writeLog(`🔍 [getModelNames] refresh: ${refresh}`);
  
  try {
    const response = await requestApi('/rescueDevice/getModelNames.jhtml', {});
    
    let models = [];
    if (response.code === '0000') {
      if (response.content && response.content.models && Array.isArray(response.content.models)) {
        models = response.content.models;
      } else if (Array.isArray(response.content)) {
        models = response.content;
      }
      
      if (models.length > 0) {
        try {
          const modelsPath = path.join(process.cwd(), 'assets/data/models-catalog.json');
          const modelsDir = path.dirname(modelsPath);
          if (!fs.existsSync(modelsDir)) {
            fs.mkdirSync(modelsDir, { recursive: true });
          }
          fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2), 'utf8');
          writeLog(`💾 [getModelNames] Đã lưu ${models.length} models vào cache`);
        } catch (e) {
          writeLog(`❌ [getModelNames] Lỗi lưu cache: ${e.message}`);
        }
      }
    }

    return {
      code: response.code,
      desc: response.desc || 'Success',
      content: models
    };
  } catch (error) {
    writeLog(`❌ [getModelNames] error: ${error.message}`);
    
    try {
      const modelsPath = path.join(process.cwd(), 'assets/data/models-catalog.json');
      if (fs.existsSync(modelsPath)) {
        const cachedModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
        writeLog(`🔄 [getModelNames] Fallback: đọc ${cachedModels.length} models từ cache`);
        return {
          code: '0000',
          desc: 'Offline fallback',
          content: cachedModels
        };
      }
    } catch (e) {}

    return {
      code: 'ERROR',
      desc: error.message,
      content: null
    };
  }
}

// ===== HÀM DOWNLOAD FIRMWARE =====
async function downloadFileWithProgress(url, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    writeLog(`📥 [Download] Starting download from: ${url}`);
    writeLog(`📥 [Download] Output: ${outputPath}`);
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        writeLog(`🔄 [Download] Redirecting to: ${response.headers.location}`);
        downloadFileWithProgress(response.headers.location, outputPath, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedSize = 0;
      let lastProgress = -1;
      
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const fileStream = fs.createWriteStream(outputPath);
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize > 0) {
          const progress = Math.round((downloadedSize / totalSize) * 100);
          if (progress !== lastProgress) {
            lastProgress = progress;
            onProgress(progress, downloadedSize, totalSize);
          }
        }
      });
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        writeLog(`✅ [Download] Completed! Size: ${downloadedSize} bytes`);
        resolve({ path: outputPath, size: downloadedSize });
      });
      
      fileStream.on('error', (err) => {
        writeLog(`❌ [Download] File stream error: ${err.message}`);
        fs.unlink(outputPath, () => {});
        reject(err);
      });
      
      response.on('error', (err) => {
        writeLog(`❌ [Download] Response error: ${err.message}`);
        fs.unlink(outputPath, () => {});
        reject(err);
      });
      
    });
    
    request.on('error', (err) => {
      writeLog(`❌ [Download] Request error: ${err.message}`);
      reject(err);
    });
    
    request.setTimeout(300000, () => {
      request.destroy();
      reject(new Error('Download timeout after 5 minutes'));
    });
  });
}

async function downloadFirmware(firmwareData, options = {}) {
  writeLog(`📥 [downloadFirmware] Starting download for: ${options.modelName || 'unknown'}`);
  
  const { romResource, toolResource, flashFlowUrl } = firmwareData;
  
  const downloadsDir = path.join(process.cwd(), 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  
  const modelName = options.modelName || 'firmware';
  const modelDir = path.join(downloadsDir, modelName);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  
  const results = [];
  let hasError = false;
  
  if (romResource && romResource.uri) {
    const romName = romResource.name || 'rom.zip';
    const romPath = path.join(modelDir, romName);
    writeLog(`📥 [downloadFirmware] Downloading ROM: ${romName}`);
    
    try {
      const result = await downloadFileWithProgress(
        romResource.uri,
        romPath,
        (progress, downloaded, total) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('download:progress', {
              type: 'rom',
              name: romName,
              progress,
              downloaded,
              total,
              status: 'downloading',
              modelName: modelName
            });
          }
        }
      );
      
      results.push({
        type: 'rom',
        name: romName,
        path: result.path,
        size: result.size,
        status: 'completed'
      });
      
      if (win && !win.isDestroyed()) {
        win.webContents.send('download:progress', {
          type: 'rom',
          name: romName,
          progress: 100,
          status: 'completed',
          path: result.path,
          modelName: modelName
        });
      }
      
    } catch (error) {
      writeLog(`❌ [downloadFirmware] ROM download failed: ${error.message}`);
      hasError = true;
      results.push({
        type: 'rom',
        name: romName,
        error: error.message,
        status: 'failed'
      });
    }
  }
  
  if (flashFlowUrl) {
    const flowPath = path.join(modelDir, 'flash_flow.json');
    writeLog(`📥 [downloadFirmware] Downloading Flash Flow...`);
    
    try {
      const result = await downloadFileWithProgress(
        flashFlowUrl,
        flowPath,
        (progress, downloaded, total) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('download:progress', {
              type: 'flashflow',
              name: 'flash_flow.json',
              progress,
              downloaded,
              total,
              status: 'downloading',
              modelName: modelName
            });
          }
        }
      );
      
      results.push({
        type: 'flashflow',
        name: 'flash_flow.json',
        path: result.path,
        size: result.size,
        status: 'completed'
      });
      
    } catch (error) {
      writeLog(`❌ [downloadFirmware] Flash Flow download failed: ${error.message}`);
      hasError = true;
      results.push({
        type: 'flashflow',
        name: 'flash_flow.json',
        error: error.message,
        status: 'failed'
      });
    }
  }
  
  if (toolResource && toolResource.uri) {
    const toolName = toolResource.name || 'tool.zip';
    const toolPath = path.join(modelDir, toolName);
    writeLog(`📥 [downloadFirmware] Downloading Tool: ${toolName}`);
    
    try {
      const result = await downloadFileWithProgress(
        toolResource.uri,
        toolPath,
        (progress, downloaded, total) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('download:progress', {
              type: 'tool',
              name: toolName,
              progress,
              downloaded,
              total,
              status: 'downloading',
              modelName: modelName
            });
          }
        }
      );
      
      results.push({
        type: 'tool',
        name: toolName,
        path: result.path,
        size: result.size,
        status: 'completed'
      });
      
    } catch (error) {
      writeLog(`❌ [downloadFirmware] Tool download failed: ${error.message}`);
      hasError = true;
      results.push({
        type: 'tool',
        name: toolName,
        error: error.message,
        status: 'failed'
      });
    }
  }
  
  const allCompleted = results.every(r => r.status === 'completed');
  
  if (win && !win.isDestroyed()) {
    win.webContents.send('download:completed', {
      modelName: modelName,
      directory: modelDir,
      files: results,
      allCompleted: allCompleted,
      hasError: hasError
    });
  }
  
  return {
    modelName: modelName,
    directory: modelDir,
    files: results,
    allCompleted: allCompleted,
    hasError: hasError
  };
}

// ===== ĐĂNG KÝ CUSTOM SCHEME =====
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
    writeLog('-> [Electron] Đang nhờ Bun lấy URL đăng nhập...');
    const scriptPath = path.join(process.cwd(), 'core/features/auth/login.ts');
    const bunCommand = `bun -e "import { createLoginUrl } from '${scriptPath}'; console.log(await createLoginUrl());"`;
    const realLoginUrl = execSync(bunCommand).toString().trim();
    writeLog('-> [Electron] ĐÃ LẤY ĐƯỢC LINK CHÍNH CHỦ TỪ LENOVO: ' + realLoginUrl);
    return realLoginUrl;
  } catch (error) {
    return 'https://passport.lenovo.com/passport/remote/login.html?config=softwarefix';
  }
}

async function updateGlobalSession(token) {
  try {
    writeLog(`🔑 [Session] Đang cập nhật session với token...`);
    const response = await requestApi('/user/getSFUserInfo.jhtml', {}, { method: 'GET' });
    writeLog(`📦 [Session] Response: ${JSON.stringify(response)}`);
    if (response.code === '0000') {
      globalSession.jwt = token;
      if (response.guid) globalSession.guid = response.guid;
      if (response.clientUuid) globalSession.clientUuid = response.clientUuid;
      writeLog(`✅ [Session] Cập nhật session thành công`);
    }
  } catch (e) {
    writeLog(`❌ [Session] Lỗi: ${e.message}`);
  }
}

function openAuthPopupWindow(parentWindow, loginUrl) {
  writeLog('🚀 [openAuthPopupWindow] BẮT ĐẦU MỞ POP-UP');
  if (!win || win.webContents.isDestroyed()) {
    writeLog('❌ [openAuthPopupWindow] win không tồn tại hoặc đã bị hủy');
    return;
  }

  if (!loginUrl || loginUrl === '') {
    writeLog('❌ [openAuthPopupWindow] loginUrl rỗng!');
    return;
  }

  writeLog(`🔗 [openAuthPopupWindow] Login URL: ${loginUrl}`);

  const authWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    parent: parentWindow,
    modal: true,
    show: true,
    title: 'Lenovo Login (Software Fix Mode)',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  writeLog('✅ [openAuthPopupWindow] Đã tạo authWindow');
  authWindow.webContents.openDevTools({ mode: 'detach' });
  authWindow.loadURL(loginUrl);

  authWindow.webContents.on('did-finish-load', () => {
    writeLog('✅ [openAuthPopupWindow] Pop-up load thành công');
    authWindow.show();
  });

  authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    writeLog(`❌ [openAuthPopupWindow] Load thất bại: ${errorCode} - ${errorDescription}`);
    writeLog(`❌ [openAuthPopupWindow] URL: ${validatedURL}`);
  });

  const handleAuthRedirect = async (redirectUrl) => {
    writeLog(`🔄 [handleAuthRedirect] Redirect đến: ${redirectUrl}`);
    
    if (redirectUrl.startsWith('softwarefix://callback') || redirectUrl.includes('api/auth/callback')) {
      writeLog(`🎉 [handleAuthRedirect] BẮT ĐƯỢC CALLBACK!`);
      
      pendingCallbackUrl = redirectUrl;
      writeLog(`📌 [handleAuthRedirect] pendingCallbackUrl = ${pendingCallbackUrl}`);
      
      if (authWindow && !authWindow.isDestroyed() && !authWindow.webContents.isDestroyed()) {
        writeLog('🔒 [handleAuthRedirect] Đóng cửa sổ pop-up');
        setTimeout(() => { 
          if (!authWindow.isDestroyed()) authWindow.close(); 
        }, 50);
      }

      try {
        const urlObj = new URL(redirectUrl.replace('softwarefix://', 'http://'));
        const rawToken = urlObj.searchParams.get('Authorization');
        writeLog(`🔑 [handleAuthRedirect] Raw token: ${rawToken}`);
        
        if (rawToken) {
          const finalToken = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;
          writeLog(`💎 [handleAuthRedirect] Final token: ${finalToken}`);

          const dataDir = path.join(process.cwd(), 'assets/data');
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

          const configPath = path.join(dataDir, 'config.json');
          let currentConfig = {};
          if (fs.existsSync(configPath)) {
            try { currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
          }
          
          currentConfig.authorizationToken = finalToken;
          fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
          writeLog(`✅ [handleAuthRedirect] Đã ghi token vào file: ${configPath}`);

          await updateGlobalSession(finalToken);

          if (win && !win.isDestroyed() && win.webContents) {
            writeLog(`📨 [handleAuthRedirect] Gửi sự kiện auth:success cho Angular`);
            win.webContents.send('auth:success', { token: finalToken });
            
            win.webContents.executeJavaScript(`
              localStorage.setItem('auth_token', '${finalToken}');
              localStorage.setItem('authorizationToken', '${finalToken}');
              console.log('💾 [Renderer] Đã lưu token vào localStorage');
            `);
          }
        }
      } catch (err) {
        writeLog(`❌ [handleAuthRedirect] Lỗi: ${err.message}`);
      }
    }
  };

  authWindow.webContents.on('will-navigate', (event, url) => {
    writeLog(`🌐 [will-navigate] ${url}`);
    handleAuthRedirect(url);
  });
  authWindow.webContents.on('will-redirect', (event, url) => {
    writeLog(`🌐 [will-redirect] ${url}`);
    handleAuthRedirect(url);
  });
  authWindow.webContents.on('did-navigate', (event, url) => {
    writeLog(`🌐 [did-navigate] ${url}`);
    handleAuthRedirect(url);
  });
  authWindow.webContents.on('did-frame-navigate', (event, url) => {
    writeLog(`🌐 [did-frame-navigate] ${url}`);
    handleAuthRedirect(url);
  });
}

// ===== IPC HANDLERS =====
ipcMain.handle('get-lookup-result', async () => {
  return { ok: true };
});

function createWindow() {
  const configPath = path.join(process.cwd(), 'assets/data/config.json');
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      configData.authorizationToken = '';
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
      writeLog(`🗑️ [Main] Đã xóa token trong config.json khi mở app`);
    } catch (e) {}
  }

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

// TẮT DEVTOOLS
// win.webContents.openDevTools();

  bootstrapSessionCookie().then(() => {
    writeLog('✅ [Main] Session cookie bootstrapped');
  });

  win.webContents.on('did-finish-load', () => {
    writeLog('📝 [Main] Inject desktopApi...');
    
    if (isFirstLoad) {
      win.webContents.executeJavaScript(`
        localStorage.removeItem('auth_token');
        localStorage.removeItem('authorizationToken');
        console.log('🗑️ [Renderer] Đã xóa token trong localStorage (lần đầu)');
      `);
      isFirstLoad = false;
    }

    win.webContents.executeJavaScript(`
      window.desktopApi = {
        isDesktop: true,
        startAuth: () => {
          console.log('🔄 [Renderer] startAuth');
          return fetch('app://localhost/api/auth/start', { method: 'POST' })
            .then(res => res.json())
            .catch(err => ({ ok: false, error: err.message }));
        },
        startInAppAuth: () => Promise.resolve({ ok: true }),
        getStoredAuthState: () => {
          console.log('🔄 [Renderer] getStoredAuthState');
          const token = localStorage.getItem('auth_token');
          if (token) {
            return Promise.resolve({ ok: true, hasStoredAuthorizationToken: true, hasToken: true, token: token });
          }
          return fetch('app://localhost/api/auth/state')
            .then(res => res.json())
            .catch(err => ({ ok: false, error: err.message }));
        },
        consumePendingAuthCallback: () => {
          console.log('🔄 [Renderer] consumePendingAuthCallback');
          const token = localStorage.getItem('auth_token');
          if (token) {
            return Promise.resolve({ ok: true, callbackUrlOrToken: token, token: token });
          }
          return fetch('app://localhost/api/auth/callback')
            .then(res => res.json())
            .catch(err => ({ ok: false, error: err.message }));
        },
        completeAuth: (callbackUrlOrToken) => {
          console.log('🔄 [Renderer] completeAuth');
          return fetch('app://localhost/api/auth/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callbackUrlOrToken })
          })
          .then(res => res.json())
          .catch(err => ({ ok: false, error: err.message }));
        },
        authWithStoredToken: () => {
          console.log('🔄 [Renderer] authWithStoredToken');
          const token = localStorage.getItem('auth_token');
          if (token) {
            return Promise.resolve({ ok: true, error: null });
          }
          return fetch('app://localhost/api/auth/state')
            .then(res => res.json())
            .catch(err => ({ ok: false, error: err.message }));
        },
        getCatalogModels: (refresh) => {
          console.log('🔥🔥🔥 [Renderer] getCatalogModels CALLED! refresh:', refresh);
          return fetch('app://localhost/api/catalog/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: refresh || false })
          })
          .then(res => res.json())
          .then(data => {
            console.log('✅ [Renderer] Catalog response:', data);
            if (data.code === '0000' && data.content && Array.isArray(data.content)) {
              localStorage.setItem('catalog_models', JSON.stringify(data.content));
              localStorage.setItem('catalog_count', data.content.length.toString());
              console.log('💾 [Renderer] Đã lưu', data.content.length, 'models vào localStorage');
            }
            return { ok: true, ...data, data: data.content, models: data.content };
          })
          .catch(err => {
            console.error('❌ [Renderer] Catalog error:', err);
            return { ok: false, error: err.message };
          });
        },

        getReadSupportHints: (modelName) => {
          console.log('🔍 [Renderer] getReadSupportHints CALLED! Model:', modelName);
          return fetch('app://localhost/api/read-support/hints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelName })
          })
          .then(res => res.json())
          .then(data => {
            console.log('✅ [Renderer] getReadSupportHints response:', data);
            return data;
          })
          .catch(err => {
            console.error('❌ [Renderer] getReadSupportHints error:', err);
            return { code: 'ERROR', desc: err.message, content: { platform: '', params: [], modelName: '', hints: [] } };
          });
        },

        lookupReadSupportByImei: (payload) => {
          console.log('🔍 [Renderer] lookupReadSupportByImei CALLED!');
          console.log('📦 [Renderer] Payload:', payload);
          return fetch('app://localhost/api/read-support/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          .then(res => res.json())
          .then(data => {
            console.log('✅ [Renderer] lookupReadSupportByImei response:', data);
            window._lastLookupResult = data;
            window.dispatchEvent(new CustomEvent('lookup:result', { detail: data }));
            return data;
          })
          .catch(err => {
            console.error('❌ [Renderer] lookupReadSupportByImei error:', err);
            const errorData = { code: 'ERROR', desc: err.message, content: { variants: [], total: 0 } };
            window._lastLookupResult = errorData;
            window.dispatchEvent(new CustomEvent('lookup:error', { detail: errorData }));
            return errorData;
          });
        },

        downloadFirmware: (firmwareData, modelName) => {
          console.log('📥 [Renderer] downloadFirmware CALLED!');
          console.log('📦 [Renderer] Model:', modelName);
          console.log('📦 [Renderer] Firmware:', firmwareData);
          
          return fetch('app://localhost/api/download/firmware', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firmwareData, modelName: modelName || 'firmware' })
          })
          .then(res => res.json())
          .then(data => {
            console.log('✅ [Renderer] Download response:', data);
            return data;
          })
          .catch(err => {
            console.error('❌ [Renderer] Download error:', err);
            return { code: 'ERROR', desc: err.message };
          });
        },

        openDownloadFolder: (path) => {
          console.log('📂 [Renderer] openDownloadFolder:', path);
          return fetch('app://localhost/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
          })
          .then(res => res.json())
          .catch(err => {
            console.error('❌ [Renderer] Open folder error:', err);
            return { ok: false, error: err.message };
          });
        },

        getLastLookupResult: () => {
          return Promise.resolve(window._lastLookupResult || null);
        },

        checkDesktopIntegration: () => Promise.resolve({ ok: true, isIntegrated: true }),
        getDesktopPromptPreference: () => Promise.resolve(true),
        checkFrameworkUpdate: () => Promise.resolve({ ok: true, hasUpdate: false }),
        getAppInfo: () => Promise.resolve({ ok: true, platform: 'darwin', version: '1.0.0' }),
        ping: () => Promise.resolve({ ok: true })
      };
      console.log('✅ [Renderer] desktopApi injected with all functions from original project!');
      console.log('✅ [Renderer] Available functions:', Object.keys(window.desktopApi));
      
      window.addEventListener('lookup:result', (event) => {
        console.log('📨 [Renderer] Received lookup:result event:', event.detail);
      });
      
      window.addEventListener('lookup:error', (event) => {
        console.log('📨 [Renderer] Received lookup:error event:', event.detail);
      });
    `);
  });

  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    writeLog(`📡 [Protocol] Request: ${request.method} ${pathname}`);
    writeLog(`📡 [Protocol] Full URL: ${request.url}`);

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: corsHeaders });
    }

    if (pathname.includes('/api/auth/state') && !pathname.includes('complete')) {
      writeLog(`🔍 [Protocol] Angular kiểm tra state`);
      const hasToken = checkStoredTokenStatus();
      return new Response(JSON.stringify({ 
        ok: true, 
        hasStoredAuthorizationToken: hasToken, 
        hasToken: hasToken 
      }), { headers: corsHeaders });
    }

    if (pathname.includes('/api/auth/start')) {
      writeLog(`🔑 [Protocol] Angular gọi /api/auth/start`);
      setTimeout(() => { openAuthPopupWindow(win, getRealLenovoLoginUrl()); }, 0);
      return new Response(JSON.stringify({ ok: true, openedInExternalBrowser: true }), { headers: corsHeaders });
    }

    if (pathname.includes('/api/auth/callback')) {
      writeLog(`🔍 [Protocol] Angular GỌI CALLBACK!`);
      const callbackUrl = pendingCallbackUrl;
      let token = null;

      if (callbackUrl) {
        try {
          const urlObj = new URL(callbackUrl.replace('softwarefix://', 'http://'));
          token = urlObj.searchParams.get('Authorization');
          if (token && !token.startsWith('Bearer ')) {
            token = `Bearer ${token}`;
          }
          writeLog(`🔑 [Protocol] Token từ callback: ${token}`);
          pendingCallbackUrl = null;
        } catch (e) {
          writeLog(`❌ [Protocol] Lỗi parse callback: ${e.message}`);
        }
      }

      if (!token) {
        try {
          const configPath = path.join(process.cwd(), 'assets/data/config.json');
          if (fs.existsSync(configPath)) {
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            token = configData.authorizationToken;
            writeLog(`📂 [Protocol] Token từ file config: ${token}`);
          }
        } catch (e) {}
      }

      if (!token) {
        writeLog(`❌ [Protocol] KHÔNG CÓ TOKEN!`);
        return new Response(JSON.stringify({ error: 'No token' }), { 
          status: 400,
          headers: corsHeaders 
        });
      }

      globalSession.jwt = token;
      await updateGlobalSession(token);

      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.executeJavaScript(`
          localStorage.setItem('auth_token', '${token}');
          localStorage.setItem('authorizationToken', '${token}');
          console.log('💾 [Renderer] Đã lưu token vào localStorage');
        `);
      }

      return new Response(JSON.stringify({ token: token }), { 
        headers: corsHeaders 
      });
    }

    if (pathname.includes('/api/auth/complete')) {
      return new Response(JSON.stringify({ ok: true, error: null }), { headers: corsHeaders });
    }

    if (pathname.includes('/api/read-support/hints')) {
      writeLog(`🔍 [Protocol] getReadSupportHints called`);
      
      try {
        const body = await request.json();
        const { modelName } = body;
        
        if (!modelName) {
          return new Response(JSON.stringify({ 
            code: 'ERROR', 
            desc: 'Model name is required' 
          }), { status: 400, headers: corsHeaders });
        }
        
        const result = await getReadSupportHints(modelName);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      } catch (error) {
        writeLog(`❌ [Protocol] getReadSupportHints error: ${error.message}`);
        return new Response(JSON.stringify({ 
          code: 'ERROR', 
          desc: error.message,
          content: { platform: '', params: [], modelName: '', hints: [] }
        }), { status: 500, headers: corsHeaders });
      }
    }

    if (pathname.includes('/api/read-support/lookup')) {
      writeLog(`🔍 [Protocol] lookupReadSupportByImei called`);
      
      try {
        const payload = await request.json();
        writeLog(`📦 [Protocol] Payload: ${JSON.stringify(payload)}`);
        
        if (!payload.imei) {
          return new Response(JSON.stringify({ 
            code: 'ERROR', 
            desc: 'IMEI is required',
            content: { variants: [], total: 0 }
          }), { status: 400, headers: corsHeaders });
        }
        
        const result = await lookupReadSupportByImei(payload);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      } catch (error) {
        writeLog(`❌ [Protocol] lookupReadSupportByImei error: ${error.message}`);
        const errorResult = {
          code: 'ERROR',
          desc: error.message,
          content: { variants: [], total: 0 }
        };
        return new Response(JSON.stringify(errorResult), { status: 500, headers: corsHeaders });
      }
    }

    if (pathname.includes('/api/download/firmware')) {
      writeLog(`📥 [Protocol] Download firmware called`);
      
      try {
        const body = await request.json();
        const { firmwareData, modelName } = body;
        
        if (!firmwareData) {
          return new Response(JSON.stringify({ 
            code: 'ERROR', 
            desc: 'Firmware data is required' 
          }), { status: 400, headers: corsHeaders });
        }
        
        const result = await downloadFirmware(firmwareData, { modelName });
        
        return new Response(JSON.stringify({
          code: result.allCompleted ? '0000' : 'PARTIAL',
          desc: result.allCompleted ? 'Download completed successfully' : 'Some files failed to download',
          content: result
        }), { headers: corsHeaders });
        
      } catch (error) {
        writeLog(`❌ [Protocol] Download error: ${error.message}`);
        return new Response(JSON.stringify({ 
          code: 'ERROR', 
          desc: error.message 
        }), { status: 500, headers: corsHeaders });
      }
    }

    if (pathname.includes('/api/open-folder')) {
      writeLog(`📂 [Protocol] Open folder called`);
      
      try {
        const body = await request.json();
        const { path: folderPath } = body;
        
        if (!folderPath) {
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'Path is required' 
          }), { status: 400, headers: corsHeaders });
        }
        
        if (fs.existsSync(folderPath)) {
          shell.showItemInFolder(folderPath);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'Folder does not exist' 
          }), { status: 404, headers: corsHeaders });
        }
        
      } catch (error) {
        writeLog(`❌ [Protocol] Open folder error: ${error.message}`);
        return new Response(JSON.stringify({ 
          ok: false, 
          error: error.message 
        }), { status: 500, headers: corsHeaders });
      }
    }

    if (pathname.includes('/api/catalog/models')) {
      writeLog(`🔍 [Protocol] Angular gọi /api/catalog/models`);
      
      try {
        let body = null;
        try {
          body = await request.json();
        } catch (e) {}
        
        writeLog(`📦 [Protocol] Body: ${JSON.stringify(body)}`);
        
        const refresh = body?.refresh || false;
        const result = await getModelNames(refresh);
        
        if (result.code === '0000' && result.content && Array.isArray(result.content) && win && !win.isDestroyed()) {
          win.webContents.executeJavaScript(`
            if (${result.content.length} > 0) {
              localStorage.setItem('catalog_models', JSON.stringify(${JSON.stringify(result.content)}));
              localStorage.setItem('catalog_count', '${result.content.length}');
              console.log('💾 [Renderer] Đã lưu ${result.content.length} models vào localStorage');
            }
          `);
        }
        
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      } catch (error) {
        writeLog(`❌ [Protocol] Catalog error: ${error.message}`);
        return new Response(JSON.stringify({ 
          code: 'ERROR', 
          desc: error.message 
        }), { status: 500, headers: corsHeaders });
      }
    }

    if (pathname.includes('/models-catalog.json')) {
      writeLog(`📂 [Protocol] Phục vụ file models-catalog.json`);
      try {
        const modelsPath = path.join(process.cwd(), 'assets/data/models-catalog.json');
        if (fs.existsSync(modelsPath)) {
          const content = fs.readFileSync(modelsPath, 'utf8');
          writeLog(`✅ [Protocol] Đã đọc file models-catalog.json (${content.length} bytes)`);
          return new Response(content, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      } catch (e) {
        writeLog(`❌ [Protocol] Lỗi đọc models-catalog.json: ${e.message}`);
      }
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

app.on('open-url', (event, url) => {
  event.preventDefault();
  writeLog('🚀 [macOS] Hệ điều hành chuyển giao link hồi hướng về app: ' + url);
  pendingCallbackUrl = url;
});

app.whenReady().then(() => { 
  writeLog('🚀 [App] App đã sẵn sàng, tạo cửa sổ...');
  createWindow(); 
});

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});