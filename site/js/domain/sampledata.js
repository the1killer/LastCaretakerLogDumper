import { REPO, PATHS, isValidVersionSha } from "../api/github.js";

// Validate image ID pattern (alphanumeric, underscores, hyphens, dots) for safe URL assembly.
export const SAFE_ID_RE = /^[A-Za-z0-9_.-]+$/;
export const VALID_SAMPLE_SCOPES = new Set(["all", "field", "cave"]);

/**
 * Formats a display code (`CAVE-###` or `SD-###`) for a sample data record.
 * @param {object} it - Sample data record.
 * @returns {string} Formatted sample code.
 */
export function sampleCode(it) {
  return it.collection === "cave"
    ? `CAVE-${String(String(it.id).replace("CavePainting_", "")).padStart(3, "0")}`
    : `SD-${String(it.id).padStart(3, "0")}`;
}

/**
 * Returns the human-readable site label for a sample data record.
 * @param {object} it - Sample data record.
 * @returns {string} Site label or `"—"`.
 */
export function sampleSiteLabel(it) {
  return it.collection === "cave" ? "Orbit archive" : it.site || "—";
}

/**
 * Builds the thumbnail image URL for a sample data record at the given version SHA.
 * Supports `"local"` working copy paths and validates IDs against `SAFE_ID_RE`.
 * @param {object} it - Sample data record.
 * @param {string|null} currentBrowseSha - Currently loaded version SHA or `"local"`.
 * @returns {string|null} Image URL, or `null` if invalid or unloaded.
 */
export function sampleImageUrl(it, currentBrowseSha) {
  if (!currentBrowseSha || !it || !SAFE_ID_RE.test(String(it.id)) || !isValidVersionSha(currentBrowseSha)) {
    return null;
  }
  const encodedId = encodeURIComponent(String(it.id));
  if (currentBrowseSha === "local") {
    return `/${PATHS.sampleImagesDir}/SampleData_${encodedId}.png`;
  }
  return `https://raw.githubusercontent.com/${encodeURI(REPO)}/${encodeURIComponent(currentBrowseSha)}/${PATHS.sampleImagesDir}/SampleData_${encodedId}.png`;
}

/**
 * Merges authoritative `sentDescription` unlock text from `voyage_sampledata_text_dump.json`
 * into curated `site/sampledata/data.json` records, and synthesizes any new items found only in the dump.
 * @param {Array<object>} samples - Curated sample records.
 * @param {Array<object>} textDump - Raw engine sample text dump records.
 * @returns {Array<object>} Merged sample records array.
 */
export function mergeSampleDataText(samples, textDump) {
  const byId = new Map();
  for (const t of textDump) byId.set(t.id, t);

  const seenIds = new Set();
  const merged = samples.map((s) => {
    seenIds.add(String(s.id));
    seenIds.add(`DA_SampleData_${s.id}`);
    const t = byId.get(`DA_SampleData_${s.id}`);
    return t && t.sentDescription ? { ...s, unlock: t.sentDescription } : s;
  });

  // Auto-fallback: synthesize items present in textDump that are missing from curated data.json.
  for (const t of textDump) {
    const rawId = String(t.id || "").replace(/^DA_SampleData_/, "");
    if (rawId && !seenIds.has(rawId) && !seenIds.has(t.id)) {
      const isCave = rawId.startsWith("CavePainting_");
      const caveNum = isCave ? rawId.replace("CavePainting_", "") : "";
      const code = isCave ? `CAVE-${caveNum.padStart(3, "0")}` : `SD-${rawId.padStart(3, "0")}`;
      merged.push({
        id: rawId,
        code,
        collection: isCave ? "cave" : "field",
        site: null,
        title: t.title && t.title !== "Hidden" ? t.title : (isCave ? `Cave Painting ${caveNum}` : `Sample ${rawId}`),
        short: t.uncollectedDescription && t.uncollectedDescription !== "No peeking" ? t.uncollectedDescription : "",
        unlock: t.sentDescription || "",
      });
    }
  }

  return merged;
}

const SAMPLE_PREFIX = "DA_SampleData_";
const CAVE_PREFIX = "CavePainting_";

/**
 * Computes a `[tier, numericId]` sort tuple for raw `DA_SampleData_*` asset IDs
 * using direct prefix checks for fast comparator execution.
 * @param {string} id - Sample data asset ID.
 * @returns {[number, number]} Sort tuple `[tier, number]`.
 */
export function sampleIdSortKey(id) {
  if (!id || !id.startsWith(SAMPLE_PREFIX)) return [2, 0];
  let rest = id.slice(SAMPLE_PREFIX.length);
  let tier = 0;
  if (rest.startsWith(CAVE_PREFIX)) {
    tier = 1;
    rest = rest.slice(CAVE_PREFIX.length);
  }
  if (!rest) return [2, 0];
  for (let i = 0; i < rest.length; i++) {
    const c = rest.charCodeAt(i);
    if (c < 48 || c > 57) return [2, 0];
  }
  return [tier, parseInt(rest, 10)];
}

/**
 * Comparator sorting sample data IDs into field items, then cave paintings, then unrecognized IDs.
 * @param {string} a - First sample ID.
 * @param {string} b - Second sample ID.
 * @returns {number} Sort order delta.
 */
export function compareSampleIds(a, b) {
  const ka = sampleIdSortKey(a);
  const kb = sampleIdSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}
