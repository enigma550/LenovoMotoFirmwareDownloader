import type { PlayStoreAppDetails } from '../../../shared/desktop-rpc';
import type { PlayStoreSession } from './play-store-auth.ts';
import { getGooglePlayProtoType, toPlainObject } from './play-store-proto.ts';

type PlayStoreFileType = 'base' | 'split' | 'obb' | 'patch';

export type PlayStoreDownloadFile = {
  fileName: string;
  type: PlayStoreFileType;
  url: string;
  sizeBytes: number;
  cookies: string;
};

type DetailsWithPurchase = {
  details: PlayStoreAppDetails;
  offerType: number;
  priceMicros: bigint;
  versionCode: string;
};

export class PlayStoreHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlayStoreHttpError';
  }
}

const FDFE_BASE_URL = 'https://android.clients.google.com/fdfe';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => !!item)
    : [];
}

function firstString(record: Record<string, unknown> | null, names: string[]) {
  if (!record) {
    return '';
  }
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
  }
  return '';
}

function firstNumber(record: Record<string, unknown> | null, names: string[], fallback = 0) {
  const value = firstString(record, names);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstBigInt(record: Record<string, unknown> | null, names: string[]) {
  const value = firstString(record, names);
  if (!value) {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function buildCookieHeader(cookies: Record<string, unknown>[]) {
  return cookies
    .map((cookie) => {
      const name = firstString(cookie, ['name']);
      const value = firstString(cookie, ['value']);
      return name && value ? `${name}=${value}` : '';
    })
    .filter((cookie) => cookie.length > 0)
    .join('; ');
}

function mapDocToDetails(doc: Record<string, unknown>, fallbackPackageName: string) {
  const details = asRecord(doc['details']);
  const appDetails = asRecord(details?.['appDetails']);
  const aggregateRating = asRecord(doc['aggregateRating']);
  const offer = asRecordArray(doc['offer'])[0] || null;
  const packageName = firstString(appDetails, ['packageName']) || fallbackPackageName;
  const versionCode = firstString(appDetails, ['versionCode']);

  return {
    details: {
      developer:
        firstString(appDetails, ['developerName']) || firstString(doc, ['creator']) || undefined,
      downloads: firstString(appDetails, ['numDownloads']) || undefined,
      packageName,
      playUrl: packageName
        ? `https://play.google.com/store/apps/details?id=${packageName}`
        : undefined,
      rating: firstString(aggregateRating, ['starRating']) || undefined,
      title: firstString(appDetails, ['title']) || firstString(doc, ['title']) || packageName,
      versionCode: versionCode || undefined,
      versionName: firstString(appDetails, ['versionString']) || undefined,
    },
    offerType: firstNumber(offer, ['offerType'], 1),
    priceMicros: firstBigInt(offer, ['micros']),
    versionCode,
  } satisfies DetailsWithPurchase;
}

export class GooglePlayClient {
  constructor(private readonly session: PlayStoreSession) {}

  private getDefaultHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set('Accept-Language', this.session.locale);
    headers.set('Authorization', `Bearer ${this.session.authToken}`);
    headers.set('Host', 'android.clients.google.com');
    headers.set('User-Agent', this.session.userAgent);
    headers.set('X-Ad-Id', '');
    headers.set('X-DFE-Client-Id', 'am-android-google');
    headers.set('X-DFE-Content-Filters', '');
    headers.set('X-DFE-Device-Config-Token', this.session.deviceConfigToken);
    headers.set('X-DFE-Device-Id', this.session.gsfId);
    headers.set('X-DFE-MCCMNC', this.session.profile.mccMnc);
    headers.set('X-DFE-Network-Type', '4');
    headers.set('X-DFE-Request-Params', 'timeoutMs=4000');
    headers.set('X-DFE-UserLanguages', this.session.locale);
    headers.set('X-Limit-Ad-Tracking-Enabled', 'false');

    if (this.session.deviceConsistencyToken) {
      headers.set('X-DFE-Device-Checkin-Consistency-Token', this.session.deviceConsistencyToken);
    }
    if (this.session.dfeCookie) {
      headers.set('X-DFE-Cookie', this.session.dfeCookie);
    }

    return headers;
  }

  private async requestWrapper(path: string, params: Record<string, string>, init?: RequestInit) {
    const url = new URL(`${FDFE_BASE_URL}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      ...init,
      headers: this.getDefaultHeaders(init?.headers),
    });
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok) {
      throw new PlayStoreHttpError(
        `Google Play request to ${path} failed with HTTP ${response.status}.`,
        response.status,
      );
    }

    const responseWrapperType = await getGooglePlayProtoType('ResponseWrapper');
    return toPlainObject(responseWrapperType, responseWrapperType.decode(responseBytes));
  }

  private async postForm(path: string, params: Record<string, string>) {
    return this.requestWrapper(
      path,
      {},
      {
        body: new URLSearchParams(params),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      },
    );
  }

  async details(packageName: string) {
    const wrapper = await this.requestWrapper('details', { doc: packageName });
    const payload = asRecord(wrapper['payload']);
    const detailsResponse = asRecord(payload?.['detailsResponse']);
    const doc = asRecord(detailsResponse?.['docV2']) || asRecord(detailsResponse?.['docV1']);
    if (!doc) {
      throw new Error(`Google Play did not return details for ${packageName}.`);
    }

    return mapDocToDetails(doc, packageName);
  }

  async purchaseDownloadFiles(options: {
    includeExtras: boolean;
    includeSplits: boolean;
    packageName: string;
    offerType: number;
    versionCode: string;
  }) {
    const buyWrapper = await this.postForm('purchase', {
      doc: options.packageName,
      ot: String(options.offerType),
      vc: options.versionCode,
    });
    const buyResponse = asRecord(asRecord(buyWrapper['payload'])?.['buyResponse']);
    const deliveryToken = firstString(buyResponse, ['encodedDeliveryToken']);

    const deliveryWrapper = await this.requestWrapper('delivery', {
      doc: options.packageName,
      dtok: deliveryToken,
      ot: String(options.offerType),
      vc: options.versionCode,
    });
    const deliveryResponse = asRecord(asRecord(deliveryWrapper['payload'])?.['deliveryResponse']);
    const status = firstNumber(deliveryResponse, ['status'], 0);
    if (status !== 1) {
      throw new Error(
        `Google Play delivery failed for ${options.packageName} with status ${status}.`,
      );
    }

    const deliveryData = asRecord(deliveryResponse?.['appDeliveryData']);
    if (!deliveryData) {
      throw new Error(`Google Play did not return APK delivery data for ${options.packageName}.`);
    }

    const cookies = buildCookieHeader(asRecordArray(deliveryData['downloadAuthCookie']));
    const files: PlayStoreDownloadFile[] = [];
    const baseUrl = firstString(deliveryData, ['downloadUrl']);
    if (baseUrl) {
      files.push({
        cookies,
        fileName: `${options.packageName}-${options.versionCode}.apk`,
        sizeBytes: Number(firstBigInt(deliveryData, ['downloadSize'])),
        type: 'base',
        url: baseUrl,
      });
    }

    if (options.includeExtras) {
      for (const file of asRecordArray(deliveryData['additionalFile'])) {
        const fileType = firstNumber(file, ['fileType'], 0) === 0 ? 'obb' : 'patch';
        const url = firstString(file, ['downloadUrl']);
        if (!url) {
          continue;
        }
        files.push({
          cookies,
          fileName: `${options.packageName}-${options.versionCode}-${fileType}.obb`,
          sizeBytes: Number(firstBigInt(file, ['size'])),
          type: fileType,
          url,
        });
      }
    }

    if (options.includeSplits) {
      for (const split of asRecordArray(deliveryData['splitDeliveryData'])) {
        const splitId = firstString(split, ['id']) || `split-${files.length}`;
        const url = firstString(split, ['downloadUrl']);
        if (!url) {
          continue;
        }
        files.push({
          cookies,
          fileName: `${options.packageName}-${options.versionCode}-${splitId}.apk`,
          sizeBytes: Number(firstBigInt(split, ['downloadSize'])),
          type: 'split',
          url,
        });
      }
    }

    if (files.length === 0) {
      throw new Error(`Google Play did not return downloadable files for ${options.packageName}.`);
    }

    return files;
  }
}
