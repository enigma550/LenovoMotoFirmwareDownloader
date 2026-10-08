import type {
  FirmwareVariant,
  LocalDownloadedFile,
  RescueFlashTransport,
} from '../models/desktop-api';

export type RescueTransportDetectionInput = Partial<
  Pick<
    LocalDownloadedFile,
    'fileName' | 'fullPath' | 'extractedDir' | 'recipeUrl' | 'selectedParameters'
  > &
    Pick<FirmwareVariant, 'romName' | 'romUrl'>
>;

function normalizeSignal(value: string | undefined) {
  return (value || '').trim().replace(/\\/g, '/').toLowerCase();
}

function extractLeafName(value: string | undefined) {
  const normalized = normalizeSignal(value);
  if (!normalized) {
    return '';
  }
  const withoutQuery = normalized.split(/[?#]/, 1)[0] || normalized;
  const segments = withoutQuery.split('/').filter(Boolean);
  return segments.at(-1) || withoutQuery;
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function looksLikePacPackage(value: string) {
  return /\.pac(?:$|[?#])/.test(value) || value.endsWith('.pac.zip');
}

function detectTransportFromExplicitSignal(
  value: string,
  leafName: string,
): RescueFlashTransport | null {
  if (!value && !leafName) {
    return null;
  }

  // 1. Fastboot XML check first (standard fastboot flash XMLs / CFC)
  if (
    includesAny(value, [
      'flashfile.xml',
      'servicefile.xml',
      'softwareupgrade.xml',
      'flashinfo.xml',
      'flashinfo_rsa.xml',
      'efuse.xml',
      'lkbin.xml',
      '_cfc.xml',
      'fastboot',
      'bootloader',
    ]) ||
    includesAny(leafName, [
      'flashfile.xml',
      'servicefile.xml',
      'softwareupgrade.xml',
      'flashinfo.xml',
      'flashinfo_rsa.xml',
      'efuse.xml',
      'lkbin.xml',
      '_cfc.xml',
    ])
  ) {
    return 'fastboot';
  }

  // 2. Unisoc PAC check
  if (
    looksLikePacPackage(value) ||
    looksLikePacPackage(leafName) ||
    includesAny(value, ['unisoc', 'spreadtrum', 'sprd']) ||
    includesAny(leafName, ['unisoc', 'spreadtrum', 'sprd'])
  ) {
    return 'unisoc';
  }

  // 3. MediaTek check
  if (
    includesAny(value, [
      '_android_scatter.txt',
      '/scatter',
      '/mtk/',
      'mediatek',
      'flashall.sh',
      'cfc_flash.bat',
      'preloader',
    ]) ||
    includesAny(leafName, ['_android_scatter.txt', 'scatter', 'flashall.sh', 'cfc_flash.bat']) ||
    value.includes('_mtk_') ||
    /\bmt\d{4}\b/i.test(value)
  ) {
    return 'mediatek';
  }

  // 4. Qualcomm EDL (QDL) emergency mode
  if (
    includesAny(value, ['rawprogram', 'firehose', 'loadinfo.xml', 'qfil']) ||
    includesAny(leafName, ['rawprogram', 'firehose', 'loadinfo.xml', 'qfil'])
  ) {
    return 'qdl';
  }

  return null;
}

function detectTransportFromRecipeName(recipeName: string): RescueFlashTransport | null {
  if (!recipeName) {
    return null;
  }

  // 1. Fastboot check first (if recipe mentions fastboot or standard XML, it's fastboot)
  if (
    includesAny(recipeName, [
      'fastboot',
      'bootloader',
      'flashfile',
      'servicefile',
      'softwareupgrade',
      '_cfc.xml',
    ])
  ) {
    return 'fastboot';
  }

  // 2. Unisoc / Spreadtrum PAC recipes
  if (
    includesAny(recipeName, ['unisoc', 'spreadtrum', 'sprd', 'tablet-pac']) ||
    /\bpac\b/.test(recipeName)
  ) {
    return 'unisoc';
  }

  // 3. MediaTek recipes
  if (
    includesAny(recipeName, ['_mtk_', ' scatter', '_scatter', 'flashtool']) ||
    recipeName.startsWith('recovery_mtk') ||
    recipeName.startsWith('rescue_mtk') ||
    recipeName.includes('mediatek')
  ) {
    return 'mediatek';
  }

  // 4. Qualcomm emergency EDL recipes (do NOT match generic '_qcom_' which matches normal Fastboot recipes)
  if (
    includesAny(recipeName, ['recoveryqcom', 'recoveryqfil', '_qfil_']) ||
    includesAny(recipeName, ['firehose', 'rawprogram', 'edl'])
  ) {
    return 'qdl';
  }

  return null;
}

export function detectRescueFlashTransport(
  input: RescueTransportDetectionInput | null | undefined,
): RescueFlashTransport {
  if (!input) {
    return 'fastboot';
  }

  const recipeTransport = detectTransportFromRecipeName(extractLeafName(input.recipeUrl));
  if (recipeTransport) {
    return recipeTransport;
  }

  const values = [
    input.fileName,
    input.fullPath,
    input.extractedDir,
    input.romName,
    input.romUrl,
    input.selectedParameters?.['category'],
  ];

  for (const rawValue of values) {
    const value = normalizeSignal(rawValue);
    const leafName = extractLeafName(rawValue);
    const detected = detectTransportFromExplicitSignal(value, leafName);
    if (detected) {
      return detected;
    }
  }

  return 'fastboot';
}
