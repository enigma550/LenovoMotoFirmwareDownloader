import { mkdir, open } from "fs/promises";
import { basename, extname, join } from "path";
import type {
  CancelDownloadResponse,
  DownloadFirmwareResponse,
  DownloadProgressMessage,
} from "../shared/rpc.ts";
import {
  getDownloadDirectory,
  sanitizeFileName,
} from "./firmware-package-utils.ts";
import { writeFirmwareMetadata } from "./firmware-metadata.ts";

type DownloadProgressEmitter = (progress: DownloadProgressMessage) => void;
type ActiveDownload = {
  controller: AbortController;
  canceled: boolean;
  paused: boolean;
  payload: any;
};

const activeDownloads = new Map<string, ActiveDownload>();
const pausedDownloadPayloads = new Map<string, any>();

function parseFileNameFromContentDisposition(
  contentDisposition: string | null,
) {
  if (!contentDisposition) return "";

  const encodedMatch = contentDisposition.match(
    /filename\*\s*=\s*UTF-8''([^;]+)/i,
  );
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Ignore malformed encoding and fallback to regular filename parsing.
    }
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();

  const unquotedMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);
  return unquotedMatch?.[1]?.trim().replace(/^"|"$/g, "") || "";
}

function inferFileName(romUrl: string, romName: string, fromHeader: string) {
  const urlFileName = (() => {
    try {
      const pathname = new URL(romUrl).pathname;
      return basename(pathname);
    } catch {
      return "";
    }
  })();

  const chosenName =
    fromHeader || urlFileName || `${romName || "firmware"}.zip`;
  const sanitized = sanitizeFileName(chosenName);
  return extname(sanitized) ? sanitized : `${sanitized}.zip`;
}

function getDownloadPath(downloadDirectory: string, fileName: string) {
  return join(downloadDirectory, fileName);
}

export async function downloadFirmwareWithProgress(
  payload: {
    downloadId: string;
    romUrl: string;
    romName: string;
    publishDate?: string;
    romMatchIdentifier?: string;
    recipeUrl?: string;
    selectedParameters?: Record<string, string>;
  },
  onProgress: DownloadProgressEmitter,
): Promise<DownloadFirmwareResponse> {
  const { downloadId, romUrl, romName } = payload;
  let savePath = "";
  let downloadedBytes = (payload as any).downloadedBytes || 0;
  let totalBytes: number | undefined = (payload as any).totalBytes;
  const downloadDirectory = getDownloadDirectory();
  const controller = new AbortController();
  activeDownloads.set(downloadId, { controller, canceled: false, paused: false, payload });

  try {
    await mkdir(downloadDirectory, { recursive: true });
    const optimisticFileName = inferFileName(romUrl, romName, "");
    const optimisticPath = getDownloadPath(
      downloadDirectory,
      optimisticFileName,
    );
    if (downloadedBytes === 0 && await Bun.file(optimisticPath).exists()) {
      return {
        ok: false,
        downloadId,
        error: `Download skipped. ZIP already exists: ${optimisticPath}`,
      };
    }

    const response = await fetch(romUrl, {
      signal: controller.signal,
      headers: downloadedBytes > 0 ? { Range: `bytes=${downloadedBytes}-` } : {},
    });

    if (downloadedBytes > 0 && response.status === 200) {
      // Server ignored Range header, reset downloadedBytes to avoid data corruption
      downloadedBytes = 0;
    }

    if (response.status === 416) {
      // Range Not Satisfiable - likely already finished or server doesn't support it
      // For now we'll just treat it as complete if we have bytes, or error if not.
      if (downloadedBytes > 0) {
        // Assume complete or error out? Let's check headers.
      }
    }

    if (!response.ok && response.status !== 206) {
      throw new Error(
        `Download request failed (${response.status} ${response.statusText}).`,
      );
    }

    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) {
        totalBytes = parseInt(match[1], 10);
      }
    }

    if (!totalBytes) {
      const totalHeader = response.headers.get("content-length");
      const parsedTotal = totalHeader ? Number.parseInt(totalHeader, 10) : 0;
      if (Number.isFinite(parsedTotal) && parsedTotal > 0) {
        totalBytes = response.status === 206 ? parsedTotal + downloadedBytes : parsedTotal;
      }
    }

    const headerFileName = parseFileNameFromContentDisposition(
      response.headers.get("content-disposition"),
    );
    const fileName = inferFileName(romUrl, romName, headerFileName);
    const finalPath = getDownloadPath(downloadDirectory, fileName);
    if (downloadedBytes === 0 && await Bun.file(finalPath).exists()) {
      return {
        ok: false,
        downloadId,
        error: `Download skipped. ZIP already exists: ${finalPath}`,
      };
    }
    savePath = finalPath;

    onProgress({
      downloadId,
      romUrl,
      romName,
      status: downloadedBytes > 0 ? "downloading" : "starting",
      savePath,
      downloadedBytes,
      totalBytes,
      speedBytesPerSecond: 0,
    });

    const writableFile = await open(savePath, downloadedBytes > 0 ? "r+" : "w");
    if (downloadedBytes > 0) {
      await writableFile.datasync(); // Ensure metadata is sync'd
      // We don't need to seek because we'll use writableFile.write(value, downloadedBytes) if needed
      // Actually fs.open with "r+" and then writing at offset works. 
      // But open(path, "a") is better for just appending.
    }

    try {
      await writeFirmwareMetadata(savePath, {
        source: "download",
        romUrl,
        romName,
        publishDate: payload.publishDate,
        romMatchIdentifier: payload.romMatchIdentifier,
        recipeUrl: payload.recipeUrl,
        selectedParameters: payload.selectedParameters,
      });
    } catch {
      // Metadata persistence is best-effort and must not fail the download.
    }

    const startedAt = Date.now();
    let lastSnapshotAt = startedAt;
    let lastSnapshotBytes = 0;

    try {
      if (!response.body) {
        const payloadBytes = new Uint8Array(await response.arrayBuffer());
        await writableFile.write(payloadBytes);
        downloadedBytes = payloadBytes.byteLength;
      } else {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;

          await writableFile.write(value, 0, value.length, downloadedBytes);
          downloadedBytes += value.byteLength;

          const now = Date.now();
          const elapsedLastSnapshot = (now - lastSnapshotAt) / 1000;

          if (elapsedLastSnapshot >= 0.8) {
            const bytesSinceLastSnapshot = downloadedBytes - lastSnapshotBytes;
            const speedBytesPerSecond =
              bytesSinceLastSnapshot / elapsedLastSnapshot;

            onProgress({
              downloadId,
              romUrl,
              romName,
              status: "downloading",
              downloadedBytes,
              totalBytes,
              speedBytesPerSecond,
            });

            lastSnapshotAt = now;
            lastSnapshotBytes = downloadedBytes;
          }
        }
      }
    } finally {
      await writableFile.close();
    }

    const completedAt = Date.now();
    const elapsedTotalSeconds = Math.max(
      (completedAt - startedAt) / 1000,
      0.001,
    );
    const averageSpeed = downloadedBytes / elapsedTotalSeconds;

    onProgress({
      downloadId,
      romUrl,
      romName,
      status: "completed",
      savePath,
      downloadedBytes,
      totalBytes: totalBytes ?? downloadedBytes,
      speedBytesPerSecond: averageSpeed,
    });

    return {
      ok: true,
      downloadId,
      status: "completed",
      savePath,
      fileName: basename(savePath),
      bytesDownloaded: downloadedBytes,
      totalBytes: totalBytes ?? downloadedBytes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const active = activeDownloads.get(downloadId);
    const wasCanceled = active?.canceled ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && /abort|cancel/i.test(error.message));
    const wasPaused = active?.paused;

    if (!wasPaused && wasCanceled && savePath && await Bun.file(savePath).exists()) {
      try {
        await Bun.file(savePath).delete();
      } catch {
        // Ignore cleanup failures.
      }
    }

    if (wasPaused) {
      pausedDownloadPayloads.set(downloadId, {
        ...payload,
        downloadedBytes,
        totalBytes,
      });

      onProgress({
        downloadId,
        romUrl,
        romName,
        status: "paused",
        savePath: savePath || undefined,
        downloadedBytes,
        totalBytes,
        speedBytesPerSecond: 0,
      });

      return {
        ok: true,
        downloadId,
        status: "paused",
      };
    }

    if (wasCanceled) {
      onProgress({
        downloadId,
        romUrl,
        romName,
        status: "canceled",
        savePath: savePath || undefined,
        downloadedBytes,
        totalBytes,
        speedBytesPerSecond: 0,
      });

      return {
        ok: false,
        downloadId,
        error: "Download canceled by user.",
      };
    }

    onProgress({
      downloadId,
      romUrl,
      romName,
      status: "failed",
      savePath: savePath || undefined,
      downloadedBytes,
      totalBytes,
      speedBytesPerSecond: 0,
      error: message,
    });

    return {
      ok: false,
      downloadId,
      error: message,
    };
  } finally {
    activeDownloads.delete(downloadId);
  }
}

export function cancelActiveDownload(
  downloadId: string,
): CancelDownloadResponse {
  const activeDownload = activeDownloads.get(downloadId);
  if (!activeDownload) {
    return {
      ok: false,
      downloadId,
      status: "not_found",
      error: "No active download found for this id.",
    };
  }

  activeDownload.canceled = true;
  activeDownload.controller.abort();
  return {
    ok: true,
    downloadId,
    status: "canceling",
  };
}

export function pauseActiveDownload(
  downloadId: string,
): { ok: boolean; error?: string } {
  const activeDownload = activeDownloads.get(downloadId);
  if (!activeDownload) {
    return {
      ok: false,
      error: "No active download found for this id.",
    };
  }

  activeDownload.paused = true;
  activeDownload.controller.abort();
  return {
    ok: true,
  };
}

export async function resumePausedDownload(
  downloadId: string,
  onProgress: DownloadProgressEmitter,
): Promise<DownloadFirmwareResponse> {
  const payload = pausedDownloadPayloads.get(downloadId);
  if (!payload) {
    return {
      ok: false,
      downloadId,
      error: "No paused download found for this id.",
    };
  }

  pausedDownloadPayloads.delete(downloadId);
  return downloadFirmwareWithProgress(payload, onProgress);
}
