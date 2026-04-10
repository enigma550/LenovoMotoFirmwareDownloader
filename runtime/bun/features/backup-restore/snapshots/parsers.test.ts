import { describe, expect, it } from 'bun:test';
import { parseFilesFromManifest } from './parsers.ts';

describe('snapshot parsers', () => {
  it('deduplicates manifest files by normalized relative path', () => {
    const files = parseFilesFromManifest([
      {
        id: 'file-1',
        fileName: 'document-a.pdf',
        relativePath: 'files/Download/document-a.pdf',
        sizeBytes: 123,
      },
      {
        id: 'file-2',
        fileName: 'document-a.pdf',
        relativePath: '/files/Download/document-a.pdf',
        sizeBytes: 456,
      },
      {
        id: 'file-3',
        fileName: 'document-b.pdf',
        path: 'files\\Download\\document-b.pdf',
        sizeBytes: 789,
      },
    ]);

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.relativePath)).toEqual([
      'files/Download/document-a.pdf',
      'files/Download/document-b.pdf',
    ]);
    expect(files.map((file) => file.id)).toEqual(['file-1', 'file-3']);
  });
});
