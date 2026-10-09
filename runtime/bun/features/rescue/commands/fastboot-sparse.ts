// Android sparse image resplitting, equivalent to what `fastboot flash` does when an
// image is larger than the device's max-download-size: the image is cut into several
// valid sparse images, each flashed in turn. Non-sparse (raw) images are wrapped as
// sparse RAW chunks first.

const SPARSE_MAGIC = 0xed26ff3a;
const FILE_HEADER_BYTES = 28;
const CHUNK_HEADER_BYTES = 12;
const DEFAULT_BLOCK_BYTES = 4096;

const CHUNK_RAW = 0xcac1;
const CHUNK_FILL = 0xcac2;
const CHUNK_DONT_CARE = 0xcac3;
const CHUNK_CRC32 = 0xcac4;

type SparseUnit = {
  type: number;
  blocks: number;
  /** Offset of the payload in the source file (RAW only). */
  dataOffset: number;
  /** Payload bytes written into the piece (RAW: blocks * blockBytes; FILL: 4). */
  dataBytes: number;
  /** Payload bytes available in the source file (RAW only; the rest is zero padded). */
  sourceBytes: number;
  fill?: Uint8Array;
};

type SparseLayout = {
  blockBytes: number;
  totalBlocks: number;
  units: SparseUnit[];
};

async function readRange(file: Blob, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

export async function isSparseImage(filePath: string) {
  const head = await readRange(Bun.file(filePath), 0, 4);
  return head.byteLength === 4 && new DataView(head.buffer).getUint32(0, true) === SPARSE_MAGIC;
}

async function parseSparseLayout(file: Blob): Promise<SparseLayout> {
  const header = await readRange(file, 0, FILE_HEADER_BYTES);
  const view = new DataView(header.buffer);
  if (header.byteLength < FILE_HEADER_BYTES || view.getUint32(0, true) !== SPARSE_MAGIC) {
    throw new Error('Not an Android sparse image.');
  }
  const fileHeaderBytes = view.getUint16(8, true);
  const chunkHeaderBytes = view.getUint16(10, true);
  const blockBytes = view.getUint32(12, true);
  const totalBlocks = view.getUint32(16, true);
  const totalChunks = view.getUint32(20, true);
  if (blockBytes === 0 || chunkHeaderBytes < CHUNK_HEADER_BYTES) {
    throw new Error('Corrupt sparse image header.');
  }

  const units: SparseUnit[] = [];
  let offset = fileHeaderBytes;
  for (let index = 0; index < totalChunks; index++) {
    const raw = await readRange(file, offset, offset + CHUNK_HEADER_BYTES);
    if (raw.byteLength < CHUNK_HEADER_BYTES) {
      throw new Error('Truncated sparse image (chunk header).');
    }
    const chunkView = new DataView(raw.buffer);
    const type = chunkView.getUint16(0, true);
    const blocks = chunkView.getUint32(4, true);
    const chunkTotalBytes = chunkView.getUint32(8, true);
    const dataOffset = offset + chunkHeaderBytes;

    if (type === CHUNK_RAW) {
      units.push({
        type,
        blocks,
        dataOffset,
        dataBytes: blocks * blockBytes,
        sourceBytes: blocks * blockBytes,
      });
    } else if (type === CHUNK_FILL) {
      units.push({
        type,
        blocks,
        dataOffset,
        dataBytes: 4,
        sourceBytes: 4,
        fill: await readRange(file, dataOffset, dataOffset + 4),
      });
    } else if (type === CHUNK_DONT_CARE) {
      units.push({ type, blocks, dataOffset, dataBytes: 0, sourceBytes: 0 });
    } else if (type !== CHUNK_CRC32) {
      throw new Error(`Unsupported sparse chunk type 0x${type.toString(16)}.`);
    }
    offset += chunkTotalBytes;
  }

  return { blockBytes, totalBlocks, units };
}

function rawFileLayout(fileBytes: number): SparseLayout {
  const blockBytes = DEFAULT_BLOCK_BYTES;
  const blocks = Math.ceil(fileBytes / blockBytes);
  return {
    blockBytes,
    totalBlocks: blocks,
    units: [
      {
        type: CHUNK_RAW,
        blocks,
        dataOffset: 0,
        dataBytes: blocks * blockBytes,
        sourceBytes: fileBytes,
      },
    ],
  };
}

function splitOversizedRawUnits(units: SparseUnit[], blockBytes: number, maxRawBlocks: number) {
  const result: SparseUnit[] = [];
  for (const unit of units) {
    if (unit.type !== CHUNK_RAW || unit.blocks <= maxRawBlocks) {
      result.push(unit);
      continue;
    }
    for (let done = 0; done < unit.blocks; done += maxRawBlocks) {
      const blocks = Math.min(maxRawBlocks, unit.blocks - done);
      const start = done * blockBytes;
      result.push({
        type: CHUNK_RAW,
        blocks,
        dataOffset: unit.dataOffset + start,
        dataBytes: blocks * blockBytes,
        sourceBytes: Math.max(0, Math.min(blocks * blockBytes, unit.sourceBytes - start)),
      });
    }
  }
  return result;
}

function unitCost(unit: SparseUnit) {
  return CHUNK_HEADER_BYTES + unit.dataBytes;
}

function writeChunkHeader(
  view: DataView,
  offset: number,
  type: number,
  blocks: number,
  total: number,
) {
  view.setUint16(offset, type, true);
  view.setUint16(offset + 2, 0, true);
  view.setUint32(offset + 4, blocks, true);
  view.setUint32(offset + 8, total, true);
}

async function buildPiece(
  file: Blob,
  layout: SparseLayout,
  units: SparseUnit[],
  startBlock: number,
): Promise<Uint8Array> {
  const pieceBlocks = units.reduce((sum, unit) => sum + unit.blocks, 0);
  const trailingBlocks = layout.totalBlocks - startBlock - pieceBlocks;
  const skipChunks = (startBlock > 0 ? 1 : 0) + (trailingBlocks > 0 ? 1 : 0);

  const size =
    FILE_HEADER_BYTES +
    skipChunks * CHUNK_HEADER_BYTES +
    units.reduce((s, u) => s + unitCost(u), 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);

  view.setUint32(0, SPARSE_MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, FILE_HEADER_BYTES, true);
  view.setUint16(10, CHUNK_HEADER_BYTES, true);
  view.setUint32(12, layout.blockBytes, true);
  view.setUint32(16, layout.totalBlocks, true);
  view.setUint32(20, units.length + skipChunks, true);
  view.setUint32(24, 0, true);

  let cursor = FILE_HEADER_BYTES;
  if (startBlock > 0) {
    writeChunkHeader(view, cursor, CHUNK_DONT_CARE, startBlock, CHUNK_HEADER_BYTES);
    cursor += CHUNK_HEADER_BYTES;
  }
  for (const unit of units) {
    writeChunkHeader(view, cursor, unit.type, unit.blocks, unitCost(unit));
    cursor += CHUNK_HEADER_BYTES;
    if (unit.type === CHUNK_RAW) {
      if (unit.sourceBytes > 0) {
        out.set(await readRange(file, unit.dataOffset, unit.dataOffset + unit.sourceBytes), cursor);
      }
    } else if (unit.type === CHUNK_FILL && unit.fill) {
      out.set(unit.fill, cursor);
    }
    cursor += unit.dataBytes;
  }
  if (trailingBlocks > 0) {
    writeChunkHeader(view, cursor, CHUNK_DONT_CARE, trailingBlocks, CHUNK_HEADER_BYTES);
  }
  return out;
}

/**
 * Yields sparse images, each no larger than `maxPieceBytes`, that together flash the
 * whole source image when applied in order.
 */
export async function* splitImageForDownload(
  filePath: string,
  maxPieceBytes: number,
): AsyncGenerator<Uint8Array> {
  const file = Bun.file(filePath);
  const layout = (await isSparseImage(filePath))
    ? await parseSparseLayout(file)
    : rawFileLayout(file.size);

  // Reserve room for the file header and a leading/trailing DONT_CARE chunk.
  const budget = maxPieceBytes - FILE_HEADER_BYTES - 2 * CHUNK_HEADER_BYTES;
  const maxRawBlocks = Math.floor((budget - CHUNK_HEADER_BYTES) / layout.blockBytes);
  if (maxRawBlocks < 1) {
    throw new Error(`max-download-size ${maxPieceBytes} is too small to flash sparse pieces.`);
  }

  const units = splitOversizedRawUnits(layout.units, layout.blockBytes, maxRawBlocks);

  let startBlock = 0;
  let index = 0;
  while (index < units.length) {
    const group: SparseUnit[] = [];
    let used = 0;
    let groupBlocks = 0;
    while (index < units.length) {
      const unit = units[index] as SparseUnit;
      if (group.length > 0 && used + unitCost(unit) > budget) break;
      group.push(unit);
      used += unitCost(unit);
      groupBlocks += unit.blocks;
      index++;
    }
    yield await buildPiece(file, layout, group, startBlock);
    startBlock += groupBlocks;
  }
}
