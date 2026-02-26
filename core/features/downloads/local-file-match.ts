export type VariantLike = {
  romName?: string;
  romUrl?: string;
  recipeUrl?: string;
};

export type LocalFileLike = {
  fileName: string;
  modifiedAt: number;
};

export function normalizeFileName(name: string) {
  return name.trim().toLowerCase();
}

export function fileNameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const value = pathname.split('/').pop() || '';
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export function getVariantCandidateFileNames(variant: VariantLike) {
  const names = new Set<string>();
  const fromName = normalizeFileName(variant.romName || '');
  if (fromName) {
    names.add(fromName);
  }
  const fromUrl = normalizeFileName(fileNameFromUrl(variant.romUrl || ''));
  if (fromUrl) {
    names.add(fromUrl);
  }
  return names;
}

export function getPreferredVariantFileName(variant: VariantLike) {
  const fromUrl = fileNameFromUrl(variant.romUrl || '').trim();
  if (fromUrl) {
    return fromUrl;
  }
  return variant.romName || 'firmware package';
}

export function findBestLocalFileMatchForVariant<FileItem extends LocalFileLike>(
  variant: VariantLike,
  files: FileItem[],
) {
  const candidates = getVariantCandidateFileNames(variant);
  if (candidates.size === 0) {
    return null;
  }

  const matches = files.filter((file) => candidates.has(normalizeFileName(file.fileName)));
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((latest, current) =>
    current.modifiedAt > latest.modifiedAt ? current : latest,
  );
}

export function findLookupVariantForLocalFile<VariantItem extends VariantLike>(
  fileName: string,
  variants: VariantItem[],
) {
  const target = normalizeFileName(fileName);
  if (!target) {
    return null;
  }

  const matches = variants
    .filter((variant) => Boolean(variant.recipeUrl))
    .filter((variant) => {
      const byName = normalizeFileName(variant.romName || '');
      const byUrl = normalizeFileName(fileNameFromUrl(variant.romUrl || ''));
      return byName === target || byUrl === target;
    });

  if (matches.length === 0) {
    return null;
  }

  return matches[matches.length - 1] || null;
}
