import type { PlayStoreArch } from '../../../shared/desktop-rpc';

export type PlayStoreDeviceProfile = {
  arch: PlayStoreArch;
  apiLevel: number;
  androidRelease: string;
  buildId: string;
  brand: string;
  bootloader: string;
  client: string;
  device: string;
  fingerprint: string;
  gsfVersion: number;
  hardware: string;
  manufacturer: string;
  mccMnc: string;
  model: string;
  product: string;
  radio: string;
  screenDensity: number;
  screenHeight: number;
  screenWidth: number;
  vendingVersion: number;
  vendingVersionString: string;
  features: string[];
  glExtensions: string[];
  locales: string[];
  platforms: string[];
  sharedLibraries: string[];
};

const COMMON_FEATURES = [
  'android.hardware.audio.output',
  'android.hardware.bluetooth',
  'android.hardware.bluetooth_le',
  'android.hardware.camera',
  'android.hardware.camera.any',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.flash',
  'android.hardware.camera.front',
  'android.hardware.faketouch',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.microphone',
  'android.hardware.opengles.aep',
  'android.hardware.ram.normal',
  'android.hardware.screen.landscape',
  'android.hardware.screen.portrait',
  'android.hardware.sensor.accelerometer',
  'android.hardware.sensor.compass',
  'android.hardware.sensor.gyroscope',
  'android.hardware.sensor.light',
  'android.hardware.sensor.proximity',
  'android.hardware.telephony',
  'android.hardware.touchscreen',
  'android.hardware.touchscreen.multitouch',
  'android.hardware.touchscreen.multitouch.distinct',
  'android.hardware.touchscreen.multitouch.jazzhand',
  'android.hardware.usb.host',
  'android.hardware.vulkan.level',
  'android.hardware.vulkan.version',
  'android.hardware.wifi',
  'android.hardware.wifi.direct',
  'android.software.activities_on_secondary_displays',
  'android.software.app_widgets',
  'android.software.autofill',
  'android.software.backup',
  'android.software.companion_device_setup',
  'android.software.cts',
  'android.software.file_based_encryption',
  'android.software.home_screen',
  'android.software.input_methods',
  'android.software.live_wallpaper',
  'android.software.managed_users',
  'android.software.picture_in_picture',
  'android.software.print',
  'android.software.secure_lock_screen',
  'android.software.securely_removes_users',
  'android.software.sip',
  'android.software.sip.voip',
  'android.software.verified_boot',
  'android.software.voice_recognizers',
  'android.software.webview',
  'com.google.android.feature.GOOGLE_BUILD',
  'com.google.android.feature.GOOGLE_EXPERIENCE',
  'com.google.android.feature.WELLBEING',
];

const COMMON_SHARED_LIBRARIES = [
  'android.ext.adservices',
  'android.ext.services',
  'android.test.base',
  'android.test.mock',
  'android.test.runner',
  'com.android.future.usb.accessory',
  'com.android.location.provider',
  'com.android.media.remotedisplay',
  'com.android.mediadrm.signer',
  'com.google.android.maps',
];

type PlayStoreDeviceIdentity = Omit<
  PlayStoreDeviceProfile,
  'arch' | 'client' | 'features' | 'glExtensions' | 'locales' | 'mccMnc' | 'sharedLibraries'
>;

const COMMON_GL_EXTENSIONS = [
  'GL_EXT_texture_filter_anisotropic',
  'GL_OES_compressed_ETC1_RGB8_texture',
];

const COMMON_LOCALES = ['en-US', 'da-DK'];

const AURORA_DEVICE_PROFILES = {
  arm64: {
    androidRelease: '15',
    apiLevel: 35,
    bootloader: 'tegu-16.0-13238451',
    brand: 'google',
    buildId: 'BD4A.250405.003',
    device: 'tegu',
    fingerprint: 'google/tegu/tegu:15/BD4A.250405.003/13238919:user/release-keys',
    gsfVersion: 251333035,
    hardware: 'tegu',
    manufacturer: 'Google',
    model: 'Pixel 9a',
    platforms: ['arm64-v8a'],
    product: 'tegu',
    radio: 'g5300t-241101-241226-B-12850354,g5300t-241101-241226-B-12850354',
    screenDensity: 420,
    screenHeight: 2424,
    screenWidth: 1080,
    vendingVersion: 84582130,
    vendingVersionString: '45.8.21-31 [0] [PR] 747433787',
  },
  armv7: {
    androidRelease: '13',
    apiLevel: 33,
    bootloader: 'A136USQSCDXL2',
    brand: 'samsung',
    buildId: 'TP1A.220624.014',
    device: 'a13x',
    fingerprint: 'samsung/a13xsq/a13x:13/TP1A.220624.014/A136USQSCDXL2:user/release-keys',
    gsfVersion: 251434027,
    hardware: 'mt6833',
    manufacturer: 'samsung',
    model: 'SM-A136U',
    platforms: ['armeabi-v7a', 'armeabi'],
    product: 'a13xsq',
    radio: 'A136USQSCDXL2',
    screenDensity: 300,
    screenHeight: 1600,
    screenWidth: 720,
    vendingVersion: 84582130,
    vendingVersionString: '45.8.21-31 [0] [PR] 747433787',
  },
} satisfies Record<PlayStoreArch, PlayStoreDeviceIdentity>;

export function createPlayStoreDeviceProfile(arch: PlayStoreArch): PlayStoreDeviceProfile {
  const identity = AURORA_DEVICE_PROFILES[arch];

  return {
    arch,
    ...identity,
    client: 'android-google',
    features: COMMON_FEATURES,
    glExtensions: COMMON_GL_EXTENSIONS,
    locales: COMMON_LOCALES,
    mccMnc: '310260',
    sharedLibraries: COMMON_SHARED_LIBRARIES,
  };
}

export function buildPlayStoreUserAgent(profile: PlayStoreDeviceProfile) {
  const supportedAbis = profile.platforms.join(';');
  const properties = [
    ['api', '3'],
    ['versionCode', String(profile.vendingVersion)],
    ['sdk', String(profile.apiLevel)],
    ['device', profile.device],
    ['hardware', profile.hardware],
    ['product', profile.product],
    ['platformVersionRelease', profile.androidRelease],
    ['model', profile.model],
    ['buildId', profile.buildId],
    ['isWideScreen', '0'],
    ['supportedAbis', supportedAbis],
  ]
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

  return `Android-Finsky/${profile.vendingVersionString} (${properties})`;
}

export function buildPlayStoreAuthUserAgent(profile: PlayStoreDeviceProfile) {
  return `GoogleAuth/1.4 (${profile.device} ${profile.buildId})`;
}

export function buildDeviceConfiguration(profile: PlayStoreDeviceProfile) {
  return {
    deviceClass: 0,
    glEsVersion: 196608,
    glExtension: profile.glExtensions,
    hasFiveWayNavigation: false,
    hasHardKeyboard: false,
    keyboard: 1,
    maxApkDownloadSizeMb: 1024,
    nativePlatform: profile.platforms,
    navigation: 1,
    screenDensity: profile.screenDensity,
    screenHeight: profile.screenHeight,
    screenLayout: 3,
    screenWidth: profile.screenWidth,
    systemAvailableFeature: profile.features,
    systemSharedLibrary: profile.sharedLibraries,
    systemSupportedLocale: profile.locales,
    touchScreen: 3,
  } satisfies Record<string, unknown>;
}

export function buildAuroraDeviceConfig(profile: PlayStoreDeviceProfile) {
  return Object.fromEntries([
    ['Build.BOOTLOADER', profile.bootloader],
    ['Build.BRAND', profile.brand],
    ['Build.DEVICE', profile.device],
    ['Build.FINGERPRINT', profile.fingerprint],
    ['Build.HARDWARE', profile.hardware],
    ['Build.ID', profile.buildId],
    ['Build.MANUFACTURER', profile.manufacturer],
    ['Build.MODEL', profile.model],
    ['Build.PRODUCT', profile.product],
    ['Build.RADIO', profile.radio],
    ['Build.VERSION.RELEASE', profile.androidRelease],
    ['Build.VERSION.SDK_INT', profile.apiLevel],
    ['CellOperator', '310'],
    ['Client', profile.client],
    ['Features', profile.features.join(',')],
    ['GL.Extensions', profile.glExtensions.join(',')],
    ['GL.Version', 196608],
    ['GSF.version', profile.gsfVersion],
    ['HasFiveWayNavigation', false],
    ['HasHardKeyboard', false],
    ['Keyboard', 1],
    ['Locales', profile.locales.join(',')],
    ['LowRamDevice', 0],
    ['MaxNumOfCPUCores', 8],
    ['Navigation', 1],
    ['Platforms', profile.platforms.join(',')],
    ['Roaming', 'mobile-notroaming'],
    ['Screen.Density', profile.screenDensity],
    ['Screen.Height', profile.screenHeight],
    ['Screen.Width', profile.screenWidth],
    ['ScreenLayout', 2],
    ['SharedLibraries', profile.sharedLibraries.join(',')],
    ['SimOperator', '38'],
    ['TimeZone', 'UTC-10'],
    ['TotalMemoryBytes', 8589935000],
    ['TouchScreen', 3],
    ['UserReadableName', `${profile.manufacturer} ${profile.model}`],
    ['Vending.version', profile.vendingVersion],
    ['Vending.versionString', profile.vendingVersionString],
  ]);
}

export function buildCheckinRequest(profile: PlayStoreDeviceProfile) {
  return {
    checkin: {
      build: {
        bootloader: profile.bootloader,
        buildProduct: profile.product,
        carrier: profile.brand,
        client: profile.client,
        device: profile.device,
        googleServices: profile.gsfVersion,
        id: profile.fingerprint,
        manufacturer: profile.manufacturer,
        model: profile.model,
        otaInstalled: false,
        product: profile.hardware,
        radio: profile.radio,
        sdkVersion: profile.apiLevel,
        timestamp: Date.now(),
      },
      cellOperator: profile.mccMnc,
      lastCheckinMsec: 0,
      roaming: 'mobile-notroaming',
      simOperator: profile.mccMnc,
      userNumber: 0,
    },
    deviceConfiguration: buildDeviceConfiguration(profile),
    fragment: 0,
    id: 0,
    locale: 'en',
    timeZone: 'UTC',
    version: 3,
  } satisfies Record<string, unknown>;
}
