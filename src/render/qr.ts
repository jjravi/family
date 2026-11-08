import qrcode from 'qrcode-generator';

/**
 * Byte budget for the share URL in the QR corner: the spec's ~1 KB, set to
 * exactly what version 22 holds at error correction L. Version 23 is avoided
 * because jsQR 1.4 (a common web decoder) has a wrong alignment-pattern table
 * for it and cannot read version 23 codes at L. Share URLs are ASCII, so bytes =
 * characters. Longer URLs get no QR corner and the notice 'link too long for QR'.
 */
export const QR_MAX_BYTES = 1003;

/** Error correction levels a plan uses: M (recovers ~15% damage) when it fits, else L (~7%). */
export type QrErrorCorrection = 'M' | 'L';

/** Byte-mode capacity of QR versions 1-40 (ISO/IEC 18004, table 7). */
export const QR_BYTE_CAPACITY: Readonly<Record<QrErrorCorrection, readonly number[]>> = {
  L: [
    17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858, 929, 1003, 1091, 1171, 1273,
    1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953,
  ],
  M: [
    14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997,
    1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331,
  ],
};

function smallestVersion(ecc: QrErrorCorrection, bytes: number): number | null {
  const index = QR_BYTE_CAPACITY[ecc].findIndex((capacity) => capacity >= bytes);
  return index < 0 ? null : index + 1;
}

/**
 * Largest version a plan uses: the smallest that holds QR_MAX_BYTES at
 * error correction L (22: 105 modules per side).
 */
export const QR_MAX_VERSION: number = smallestVersion('L', QR_MAX_BYTES)!;

/** Blank modules on each side, part of the planned square (the QR spec minimum). */
export const QR_QUIET_ZONE = 4;

const PT_PER_MM = 72 / 25.4;

/** Smallest printed square, quiet zone included: 2 cm (≈ 56.69 pt). */
export const QR_MIN_SIZE = 20 * PT_PER_MM;

/**
 * Smallest printed module: 0.35 mm (≈ 0.99 pt), so a phone scans a framed
 * print through the glass. Codes above version 8 grow past 2 cm to keep it.
 */
export const QR_MIN_MODULE = 0.35 * PT_PER_MM;

/** How the QR corner would print for a given text. */
export interface QrPlan {
  /** QR version, 1-QR_MAX_VERSION. */
  version: number;
  /** Modules per side, excluding the quiet zone (17 + 4 × version). */
  modules: number;
  /** Error correction level. */
  ecc: QrErrorCorrection;
  /**
   * Recommended printed size in points, including the 4-module quiet zone: at
   * least QR_MIN_SIZE (2 cm), grown so each module is at least QR_MIN_MODULE.
   */
  size: number;
}

function chooseCode(text: string): { version: number; ecc: QrErrorCorrection } | null {
  if (text.length > QR_MAX_BYTES || /[^\x00-\x7f]/.test(text)) return null;
  const versionM = smallestVersion('M', text.length);
  if (versionM !== null && versionM <= QR_MAX_VERSION) return { version: versionM, ecc: 'M' };
  return { version: smallestVersion('L', text.length)!, ecc: 'L' };
}

/**
 * The QR plan for `text` (the full share URL), or null when it is longer than
 * QR_MAX_BYTES or not ASCII: then omit the corner and show 'link too long for
 * QR'. Picks the smallest version at error correction M when that version is
 * at most QR_MAX_VERSION (up to 779 bytes), else the smallest at L. Pure and
 * deterministic.
 */
export function qrPlan(text: string): QrPlan | null {
  const choice = chooseCode(text);
  if (!choice) return null;
  const modules = 17 + 4 * choice.version;
  const size = Math.max(QR_MIN_SIZE, (modules + 2 * QR_QUIET_ZONE) * QR_MIN_MODULE);
  return { version: choice.version, modules, ecc: choice.ecc, size: Math.ceil(size * 100) / 100 };
}

type QrCode = ReturnType<typeof qrcode>;

function formatNumber(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Dark modules as one path in module units, quiet zone offset included: one rectangle per horizontal run. */
function darkModulePath(code: QrCode): string {
  const count = code.getModuleCount();
  let d = '';
  let lastX = 0;
  let lastY = 0;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; ) {
      if (!code.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < count && code.isDark(row, col)) col++;
      const x = start + QR_QUIET_ZONE;
      const y = row + QR_QUIET_ZONE;
      const width = col - start;
      // After `z` the current point is the start of the closed run, so each move is relative to the previous run.
      d += d === '' ? `M${x} ${y}` : `m${x - lastX} ${y - lastY}`;
      d += `h${width}v1h-${width}z`;
      lastX = x;
      lastY = y;
    }
  }
  return d;
}

/**
 * SVG markup for a QR code of `text`: one `<g>` whose square, quiet zone
 * included, spans (x, y) to (x + size, y + size) in user units, with every dark
 * module in a single `<path>` filled with `color` (`shape-rendering="crispEdges"`,
 * integer coordinates in module units under one transform). Light modules and
 * the quiet zone are left transparent, so place it on a light background.
 * Uses the version and error correction of qrPlan(text). Null when qrPlan is
 * null. Pure and deterministic.
 */
export function qrSvg(text: string, x: number, y: number, size: number, color: string): string | null {
  const choice = chooseCode(text);
  if (!choice) return null;
  const code = qrcode(choice.version as Parameters<typeof qrcode>[0], choice.ecc);
  code.addData(text, 'Byte');
  code.make();
  const scale = size / (code.getModuleCount() + 2 * QR_QUIET_ZONE);
  return (
    `<g transform="translate(${formatNumber(x)} ${formatNumber(y)}) scale(${formatNumber(scale)})" shape-rendering="crispEdges">` +
    `<path fill="${escapeAttribute(color)}" d="${darkModulePath(code)}"/></g>`
  );
}
