import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitImageForDownload } from './fastboot-sparse.ts';

const BLOCK = 4096;
const dir = mkdtempSync(join(tmpdir(), 'sparse-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function chunk(type: number, blocks: number, payload: Uint8Array) {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, type, true);
  view.setUint32(4, blocks, true);
  view.setUint32(8, out.length, true);
  out.set(payload, 12);
  return out;
}

function sparseImage(totalBlocks: number, chunks: Uint8Array[]) {
  const header = new Uint8Array(28);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0xed26ff3a, true);
  view.setUint16(4, 1, true);
  view.setUint16(8, 28, true);
  view.setUint16(10, 12, true);
  view.setUint32(12, BLOCK, true);
  view.setUint32(16, totalBlocks, true);
  view.setUint32(20, chunks.length, true);
  return Buffer.concat([header, ...chunks]);
}

/** Reference sparse expander: applies a sparse image onto `target`. */
function applySparse(image: Uint8Array, target: Uint8Array) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  expect(view.getUint32(0, true)).toBe(0xed26ff3a);
  const totalChunks = view.getUint32(20, true);
  let offset = 28;
  let block = 0;
  for (let i = 0; i < totalChunks; i++) {
    const type = view.getUint16(offset, true);
    const blocks = view.getUint32(offset + 4, true);
    const total = view.getUint32(offset + 8, true);
    const data = image.subarray(offset + 12, offset + total);
    if (type === 0xcac1) {
      target.set(data, block * BLOCK);
    } else if (type === 0xcac2) {
      for (let b = 0; b < blocks * BLOCK; b += 4) target.set(data, block * BLOCK + b);
    }
    block += blocks;
    offset += total;
  }
  expect(block).toBe(view.getUint32(16, true));
}

describe('splitImageForDownload', () => {
  test('resplits a sparse image into pieces under the limit that rebuild the same data', async () => {
    const raw1 = new Uint8Array(10 * BLOCK).map((_, i) => (i * 7) % 251);
    const raw2 = new Uint8Array(3 * BLOCK).map((_, i) => (i * 13) % 241);
    const fill = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
    const totalBlocks = 10 + 5 + 20 + 3 + 4;
    const image = sparseImage(totalBlocks, [
      chunk(0xcac1, 10, raw1),
      chunk(0xcac2, 5, fill),
      chunk(0xcac3, 20, new Uint8Array(0)),
      chunk(0xcac1, 3, raw2),
      chunk(0xcac3, 4, new Uint8Array(0)),
    ]);
    const path = join(dir, 'a.img');
    writeFileSync(path, image);

    const expected = new Uint8Array(totalBlocks * BLOCK);
    applySparse(image, expected);

    const limit = 3 * BLOCK + 64;
    const actual = new Uint8Array(totalBlocks * BLOCK);
    let pieces = 0;
    for await (const piece of splitImageForDownload(path, limit)) {
      expect(piece.byteLength).toBeLessThanOrEqual(limit);
      applySparse(piece, actual);
      pieces++;
    }
    expect(pieces).toBeGreaterThan(3);
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
  });

  test('wraps a raw image (padding the last block) when it is not sparse', async () => {
    const data = new Uint8Array(7 * BLOCK + 100).map((_, i) => (i * 31) % 253);
    const path = join(dir, 'raw.img');
    writeFileSync(path, data);

    const actual = new Uint8Array(8 * BLOCK);
    for await (const piece of splitImageForDownload(path, 3 * BLOCK + 64)) {
      expect(piece.byteLength).toBeLessThanOrEqual(3 * BLOCK + 64);
      applySparse(piece, actual);
    }
    expect(Buffer.from(actual.subarray(0, data.length)).equals(Buffer.from(data))).toBe(true);
    expect(actual.subarray(data.length).every((b) => b === 0)).toBe(true);
  });
});
