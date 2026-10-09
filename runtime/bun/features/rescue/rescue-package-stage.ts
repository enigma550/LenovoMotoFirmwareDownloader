/**
 * Rescue package stage — pure decisions around the firmware package used by
 * Rescue Lite: metadata sidecar patching, extraction directory resolution and
 * the shared success-result shape (dry-run and live flash).
 */
import { basename } from 'node:path';
import type { RescueLiteFirmwareResponse } from '../../../shared/desktop-rpc';
import {
  getExtractDirForPackagePath,
  getRescueExtractDirectoryRoot,
} from '../../firmware-package-utils.ts';
import { assertPathInsideAllowedRoots } from '../../path-guard.ts';

export interface RescueMetadataPatchInput {
  romUrl?: string;
  romName?: string;
  publishDate?: string;
  recipeUrl?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
}

/** Builds the firmware metadata patch written next to the rescue package. */
export function buildRescueMetadataPatch(payload: RescueMetadataPatchInput) {
  return {
    source: 'rescue-lite',
    romUrl: payload.romUrl,
    romName: payload.romName,
    publishDate: payload.publishDate,
    recipeUrl: payload.recipeUrl,
    romMatchIdentifier:
      payload.romMatchIdentifier ||
      payload.selectedParameters?.romMatchIdentifier ||
      payload.selectedParameters?.romMatchId,
    selectedParameters: payload.selectedParameters,
  };
}

/**
 * Resolves the extraction directory for a package: a renderer-provided
 * directory (validated against the rescue extract root) or the sanitized
 * directory derived from the package name.
 */
export function resolveLinkedExtractDir(savePath: string, localExtractedDir?: string): string {
  const requested = localExtractedDir?.trim();
  if (requested) {
    return assertPathInsideAllowedRoots(
      requested,
      [getRescueExtractDirectoryRoot()],
      'extracted firmware directory',
    );
  }
  return getExtractDirForPackagePath(savePath);
}

export interface RescueLiteResultInput {
  downloadId: string;
  savePath: string;
  workDir: string;
  bytesDownloaded: number;
  totalBytes: number;
  dryRun: boolean;
  reusedPackage: boolean;
  reusedExtraction: boolean;
  commandSource: string;
  commandPlan: string[];
  flashTransport: RescueLiteFirmwareResponse['flashTransport'];
  qdlStorage: RescueLiteFirmwareResponse['qdlStorage'];
  qdlSerial?: string;
}

/** Builds the shared success response for dry-run and live flash results. */
export function buildRescueLiteResult(input: RescueLiteResultInput): RescueLiteFirmwareResponse {
  return {
    ok: true,
    downloadId: input.downloadId,
    savePath: input.savePath,
    fileName: basename(input.savePath),
    bytesDownloaded: input.bytesDownloaded,
    totalBytes: input.totalBytes || input.bytesDownloaded,
    workDir: input.workDir,
    dryRun: input.dryRun,
    reusedPackage: input.reusedPackage,
    reusedExtraction: input.reusedExtraction,
    commandSource: input.commandSource,
    commandPlan: input.commandPlan,
    flashTransport: input.flashTransport,
    qdlStorage: input.qdlStorage,
    qdlSerial: input.qdlSerial,
  };
}
