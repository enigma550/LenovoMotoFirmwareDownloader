import { runCommand } from './connected-backups-adb.ts';

const REMOTE_SIZE_CONCURRENCY = 1;
const REMOTE_SIZE_BATCH_SIZE = 12;

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex] as T, currentIndex);
    }
  });
  await Promise.all(runners);
}

async function readRemoteSizeBatch(remotePaths: string[]) {
  const quotedPaths = remotePaths.map(shellQuote).join(' ');
  const command = [
    `for f in ${quotedPaths}; do`,
    '  if stat -c %s "$f" >/dev/null 2>&1; then',
    '    stat -c %s "$f";',
    '  elif toybox stat -c %s "$f" >/dev/null 2>&1; then',
    '    toybox stat -c %s "$f";',
    '  else',
    '    wc -c < "$f" 2>/dev/null || echo "";',
    '  fi',
    'done',
  ].join('\n');

  const result = await runCommand('adb', ['shell', command], 120_000);
  if (result.exitCode !== 0) {
    return new Map<string, number>();
  }

  const sizes = result.stdoutText
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const sizeByPath = new Map<string, number>();
  for (const [index, remotePath] of remotePaths.entries()) {
    const sizeBytes = sizes[index];
    if (typeof sizeBytes === 'number') {
      sizeByPath.set(remotePath, sizeBytes);
    }
  }
  return sizeByPath;
}

export async function loadRemoteFileSizes(remotePaths: string[]) {
  const chunks = chunkArray(remotePaths, REMOTE_SIZE_BATCH_SIZE);
  const sizeByPath = new Map<string, number>();

  await mapWithConcurrency(chunks, REMOTE_SIZE_CONCURRENCY, async (chunk) => {
    const chunkSizes = await readRemoteSizeBatch(chunk);
    for (const [remotePath, sizeBytes] of chunkSizes) {
      sizeByPath.set(remotePath, sizeBytes);
    }
  });

  return sizeByPath;
}
