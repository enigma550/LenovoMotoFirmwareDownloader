import {
  cancelConnectedBackupProcess,
  getConnectedBackupPreviewProgress,
  scanConnectedBackupPreview,
} from '../../runtime/bun/features/backup-restore/connected/preview.ts';

function readTimeoutMs() {
  const rawValue = process.env['LMFD_SCAN_TIMEOUT_MS'] || '45000';
  const timeoutMs = Number.parseInt(rawValue, 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45_000;
}

async function main() {
  const timeoutMs = readTimeoutMs();
  const startedAt = Date.now();
  let lastSeenLogCount = 0;

  const emitProgress = async () => {
    const progress = await getConnectedBackupPreviewProgress();
    const startCount = Math.max(lastSeenLogCount, progress.logBaseCount);
    const endCount = progress.logCount;

    for (let count = startCount; count < endCount; count += 1) {
      const indexInBuffer = count - progress.logBaseCount;
      const line = progress.logs[indexInBuffer];
      if (line) {
        console.log(`[preview] ${line}`);
      }
    }

    lastSeenLogCount = Math.max(lastSeenLogCount, endCount);
  };

  const progressTicker = setInterval(() => {
    void emitProgress().catch(() => {});
  }, 500);
  progressTicker.unref?.();

  const timeout = setTimeout(() => {
    const result = cancelConnectedBackupProcess();
    console.error(`[preview] timed out after ${timeoutMs} ms: ${result.detail}`);
  }, timeoutMs);
  timeout.unref?.();

  try {
    console.log(`[preview] starting connected preview scan (timeout ${timeoutMs} ms)`);
    const response = await scanConnectedBackupPreview();
    await emitProgress();

    const elapsedMs = Date.now() - startedAt;
    console.log(`[preview] finished in ${elapsedMs} ms`);
    console.log(JSON.stringify(response, null, 2));

    if (!response.ok) {
      process.exitCode = 1;
    }
  } finally {
    clearInterval(progressTicker);
    clearTimeout(timeout);
  }
}

await main();
