/**
 * QR code, rendered as inline SVG on the server.
 *
 * A tiny byte-mode QR encoder rather than a dependency or a third-party image
 * URL — a payment address must never round-trip through someone else's server,
 * and a 30 kB library for one component is not worth it.
 */

/** Galois field tables for Reed–Solomon over GF(256). */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j]! ?? 0) ^ mul(poly[j]!, EXP[i]!);
      next[j + 1] = (next[j + 1]! ?? 0) ^ poly[j]!;
    }
    poly = next;
  }
  return poly;
}

function reedSolomon(data: number[], ecLength: number): number[] {
  const gen = generatorPoly(ecLength);
  const result = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0]!;
    result.shift();
    result.push(0);
    for (let i = 0; i < ecLength; i += 1) {
      result[i] = result[i]! ^ mul(gen[i + 1]!, factor);
    }
  }
  return result;
}

/** Version 1–10, error correction level M. Enough for any payment URI. */
const CAPACITY_M = [null, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
const EC_PER_BLOCK_M = [null, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS_M = [null, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));

  let version = 1;
  while (version < 10 && bytes.length > (CAPACITY_M[version] ?? 0)) version += 1;
  if (bytes.length > (CAPACITY_M[version] ?? 0)) {
    throw new Error("Payload too large for this QR encoder");
  }

  const size = 17 + version * 4;
  const lengthBits = version < 10 ? 8 : 16;

  // --- Bit stream -------------------------------------------------------
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);              // byte mode
  push(bytes.length, lengthBits);
  for (const byte of bytes) push(byte, 8);

  const totalBlocks = BLOCKS_M[version]!;
  const ecPerBlock = EC_PER_BLOCK_M[version]!;
  const totalCodewords = CAPACITY_M[version]! + 2; // data capacity + mode overhead
  const dataCodewords = Math.floor(totalCodewords);

  push(0, Math.min(4, dataCodewords * 8 - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  const PAD = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < dataCodewords) { data.push(PAD[padIndex % 2]!); padIndex += 1; }

  // --- Interleave blocks -------------------------------------------------
  const perBlock = Math.floor(data.length / totalBlocks);
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < totalBlocks; b += 1) {
    const start = b * perBlock;
    const chunk = data.slice(start, b === totalBlocks - 1 ? data.length : start + perBlock);
    blocks.push(chunk);
    ecBlocks.push(reedSolomon(chunk, ecPerBlock));
  }
  const final: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of blocks) if (i < block.length) final.push(block[i]!);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) final.push(block[i]!);
  }

  // --- Matrix ------------------------------------------------------------
  const modules: (boolean | null)[][] = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null));

  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                   (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                   (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        modules[rr]![cc] = on;
      }
    }
  };
  placeFinder(0, 0); placeFinder(size - 7, 0); placeFinder(0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    const on = i % 2 === 0;
    if (modules[6]![i] === null) modules[6]![i] = on;
    if (modules[i]![6] === null) modules[i]![6] = on;
  }

  if (version >= 2) {
    const centres = [6, size - 7];
    for (const r of centres) {
      for (const c of centres) {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            modules[r + dr]![c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          }
        }
      }
    }
  }

  modules[size - 8]![8] = true; // dark module

  // Format information, EC level M (0b00), mask 0.
  const formatBits = 0b101010000010010;
  for (let i = 0; i < 15; i += 1) {
    const bit = ((formatBits >> i) & 1) === 1;
    if (i < 6) modules[i]![8] = bit;
    else if (i < 8) modules[i + 1]![8] = bit;
    else if (i === 8) modules[8]![7] = bit;
    else modules[8]![14 - i] = bit;

    if (i < 8) modules[8]![size - 1 - i] = bit;
    else modules[size - 15 + i]![8] = bit;
  }

  // --- Place data, mask 0 ------------------------------------------------
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c;
        if (modules[row]![cc] !== null) continue;
        const byte = final[bitIndex >> 3] ?? 0;
        let dark = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
        bitIndex += 1;
        if ((row + cc) % 2 === 0) dark = !dark; // mask 0
        modules[row]![cc] = dark;
      }
    }
    upward = !upward;
  }

  return modules.map((row) => row.map((cell) => cell === true));
}

export function QrCode({ value, size = 200, className }: {
  value: string; size?: number; className?: string;
}) {
  let matrix: boolean[][];
  try {
    matrix = qrMatrix(value);
  } catch {
    return (
      <div className={className} style={{ width: size, height: size }}>
        <p className="flex h-full items-center justify-center rounded-lg border border-line p-3 text-center text-micro text-faint">
          Copy the address below
        </p>
      </div>
    );
  }

  const count = matrix.length;
  const quiet = 4;
  const total = count + quiet * 2;

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Payment QR code"
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#0b1210" /> : null,
        ),
      )}
    </svg>
  );
}
