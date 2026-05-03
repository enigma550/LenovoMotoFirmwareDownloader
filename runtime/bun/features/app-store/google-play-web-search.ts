import type { PlayStoreSearchResult } from '../../../shared/desktop-rpc';

const PLAY_STORE_SEARCH_URL = 'https://play.google.com/store/search';
const PLAY_STORE_WEB_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_REGION = 'US';
const SEARCH_TIMEOUT_MS = 10_000;

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&#(\d+);/g, (_match, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readQuotedAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
  return match?.[1] ? decodeHtml(match[1]) : '';
}

function cleanPackageName(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readCardTitle(anchorTag: string, cardHtml: string, packageName: string) {
  const ariaLabel = readQuotedAttribute(anchorTag, 'aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  const titleMatch =
    cardHtml.match(/<span\b[^>]*class="[^"]*\bDdYX5\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
    cardHtml.match(/<button\b[^>]*aria-label="([^"]+)"/i);

  if (!titleMatch?.[1]) {
    return packageName;
  }

  return decodeHtml(stripTags(titleMatch[1])) || packageName;
}

function readImageSource(imageTag: string) {
  return readQuotedAttribute(imageTag, 'src').replace(/&amp;/g, '&');
}

function readCardIconUrl(cardHtml: string) {
  const imageTags = [...cardHtml.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const iconTag =
    imageTags.find((tag) => readQuotedAttribute(tag, 'alt') === 'Icon image') ||
    imageTags.find(
      (tag) =>
        readQuotedAttribute(tag, 'alt') === 'Thumbnail image' &&
        readQuotedAttribute(tag, 'class').split(/\s+/).includes('stzEZd'),
    ) ||
    imageTags.find((tag) => readQuotedAttribute(tag, 'alt') === 'Thumbnail image');

  return iconTag ? readImageSource(iconTag) : '';
}

export async function searchGooglePlayWebApps(query: string, limit: number) {
  const url = new URL(PLAY_STORE_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('c', 'apps');
  url.searchParams.set('hl', DEFAULT_LOCALE);
  url.searchParams.set('gl', DEFAULT_REGION);

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'Accept-Language': `${DEFAULT_LOCALE},en;q=0.9`,
        'User-Agent': PLAY_STORE_WEB_USER_AGENT,
      },
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(`Google Play web search failed with HTTP ${response.status}.`);
    }

    const html = await response.text();
    const results = new Map<string, PlayStoreSearchResult>();
    const anchorPattern = /<a\b[^>]*href="\/store\/apps\/details\?id=([^"&]+)[^"]*"[^>]*>/gi;

    for (const match of html.matchAll(anchorPattern)) {
      const packageName = cleanPackageName(match[1] || '');
      if (!packageName || results.has(packageName)) {
        continue;
      }

      const anchorTag = match[0];
      const cardHtml = html.slice(
        match.index + anchorTag.length,
        match.index + anchorTag.length + 3500,
      );
      results.set(packageName, {
        iconUrl: readCardIconUrl(cardHtml) || undefined,
        packageName,
        title: readCardTitle(anchorTag, cardHtml, packageName),
      });

      if (results.size >= limit) {
        break;
      }
    }

    return [...results.values()];
  } finally {
    clearTimeout(timeout);
  }
}
