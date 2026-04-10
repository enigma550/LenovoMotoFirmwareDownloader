import { join } from 'node:path';

export async function ensureLocalArtifactExists(moduleDir: string, fileName: string) {
  const candidatePath = join(moduleDir, fileName);
  const artifactFile = Bun.file(candidatePath);
  if (await artifactFile.exists()) {
    return candidatePath;
  }

  throw new Error(
    `Required on-device artifact is missing: ${candidatePath}. Build it before using this feature.`,
  );
}
