// Subtitle names encode "<storyline>-<part>", e.g. "CU3_3-1" .. "CU3_3-6" are six
// lines of the same storyline (CU3 = Concurrent Update 3, "3" = story index).
// Part suffixes aren't always plain integers (e.g. "-1a", "-2_Anna_B"), so only the
// leading digits are used for ordering within a group.
const SUBTITLE_PART_RE = /^(.*)-(\d.*)$/;

let cachedSubsRef = null;
let cachedGroupedSubs = [];

/**
 * Extracts the storyline group key from a subtitle Name.
 * @param {string} name - Subtitle entry Name.
 * @returns {string} Storyline key prefix.
 */
export function subtitleGroupKey(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[1] : (name || "");
}

/**
 * Extracts the part suffix label from a subtitle Name.
 * @param {string} name - Subtitle entry Name.
 * @returns {string} Part label suffix, or empty string if none.
 */
export function subtitlePartLabel(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[2] : "";
}

/**
 * Extracts the leading integer from a subtitle part suffix for numerical sorting.
 * @param {string} name - Subtitle entry Name.
 * @returns {number} Parsed part number, or 0 if not numeric.
 */
export function subtitlePartNumber(name) {
  const n = parseInt(subtitlePartLabel(name), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Generates a stable page anchor key for a subtitle line.
 * @param {object} item - Subtitle entry object.
 * @returns {string} Page key for URL hash deep-links.
 */
export function subtitlePageKey(item) {
  return `part:${item?.Name || ""}`;
}

/**
 * Groups subtitle entries by storyline key, sorting parts numerically and summing durations.
 * Memoized by input array reference and pre-computes lowercase `haystack` strings for filtering.
 * @param {Array<object>} subs - Normalized subtitle entries array.
 * @returns {Array<{key: string, items: Array<object>, totalDuration: number, haystack: string}>}
 */
export function groupSubtitles(subs) {
  if (subs === cachedSubsRef) return cachedGroupedSubs;
  const order = [];
  const byKey = new Map();
  for (const s of subs) {
    const key = subtitleGroupKey(s.Name);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key).push(s);
  }
  cachedGroupedSubs = order.map((key) => {
    const items = byKey.get(key).slice().sort((a, b) => subtitlePartNumber(a.Name) - subtitlePartNumber(b.Name));
    const totalDuration = items.reduce((sum, s) => sum + (s.Duration || 0), 0);
    const haystack = `${key} ${items.map((s) => `${s.Name || ""} ${s.Subtitle || ""}`).join(" ")}`.toLowerCase();
    return { key, items, totalDuration, haystack };
  });
  cachedSubsRef = subs;
  return cachedGroupedSubs;
}
