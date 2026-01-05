/**
 * Customer UI label formatter
 * Converts "Nos" unit to "Pic"/"Pics" ONLY for customer-facing screens.
 *
 * Rules requested:
 * - "1 Nos" -> "1Pic"
 * - "2 Nos" -> "2Pics" (plural for 2 or more)
 * - Also strips trailing commas/spaces like "1 Nos," -> "Pic"
 */
export function formatCustomerUnitLabel(label) {
  if (label === null || label === undefined) return label;

  const cleaned = label
    .toString()
    .replace(/,+/g, '') // remove trailing commas from DB like "1 Nos,"
    .trim();

  if (!cleaned) return cleaned;

  // Match "2 Nos", "2Nos", "2 nos"
  const m = cleaned.match(/^(\d+)\s*nos\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n)) return 'Pic';
    const plural = n >= 2 ? 'Pics' : 'Pic';
    return `${Math.max(0, n)}${plural}`;
  }

  // Match just "Nos"
  if (/^nos\b/i.test(cleaned)) return 'Pic';

  // Normalize any existing "Piece"/"Pieces" strings
  const mPiece = cleaned.match(/^(\d+)\s*piece(?:s)?\b/i);
  if (mPiece) {
    const n = parseInt(mPiece[1], 10);
    if (!Number.isFinite(n)) return 'Pic';
    const plural = n >= 2 ? 'Pics' : 'Pic';
    return `${Math.max(0, n)}${plural}`;
  }
  if (/^piece(?:s)?\b/i.test(cleaned)) return 'Pic';

  return cleaned;
}


