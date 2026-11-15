/**
 * Escapes HTML special characters to prevent markup injection in rendered strings.
 * @param {*} str - Value to escape.
 * @returns {string} Escaped HTML-safe string.
 */
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/**
 * Formats a duration in seconds with one decimal place.
 * @param {number|*} d - Duration in seconds.
 * @returns {string} Formatted duration string, or empty string if not a number.
 */
export function formatDuration(d) {
  return typeof d === "number" ? `${d.toFixed(1)}s` : "";
}

/**
 * Extracts the YYYY-MM-DD date prefix from an ISO timestamp.
 * @param {string} iso - ISO-8601 date string.
 * @returns {string} Date string or empty string.
 */
export function formatDate(iso) {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Extracts and truncates the first line of a multi-line commit message.
 * @param {string} msg - Commit message.
 * @returns {string} First line truncated to 70 characters.
 */
export function firstLine(msg) {
  const line = (msg || "").split("\n")[0];
  return line.length > 70 ? line.slice(0, 67) + "…" : line;
}

/**
 * Normalizes whitespace in a selected text snippet.
 * @param {string} text - Raw selection text.
 * @returns {string} Normalized text with collapsed whitespace.
 */
export function normalizeSelectedText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * Normalizes and caps a selected text snippet to 200 characters for hash deep-links.
 * @param {string} text - Raw selection text.
 * @returns {string} Normalized and trimmed selection snippet.
 */
export function trimmedSelectionText(text) {
  const normalized = normalizeSelectedText(text);
  return normalized.length > 200 ? `${normalized.slice(0, 197)}…` : normalized;
}

/**
 * Converts a hash parameter value to a string, handling nullish values safely.
 * @param {*} value - Parameter value.
 * @returns {string} Stringified value or empty string.
 */
export function hashValue(value) {
  return value == null ? "" : String(value);
}

/**
 * Escapes a value for safe use inside a CSS attribute selector.
 * @param {*} value - Raw attribute value.
 * @returns {string} CSS-escaped selector value.
 */
export function selectorValue(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

/**
 * Clamps a numeric value between min and max bounds.
 * @param {number} value - Value to clamp.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} Clamped value.
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolves the active selection index within a filtered list, preferring a matching key.
 * @param {Array<object>} items - Filtered item array.
 * @param {string} keyField - Property name used as the stable key.
 * @param {string|null} activeKey - Previously selected item key.
 * @param {number} activeIdx - Previously selected index.
 * @returns {number} Valid index in `items`, or -1 when `items` is empty.
 */
export function resolveSelectedIndex(items, keyField, activeKey, activeIdx) {
  if (!items || !items.length) return -1;
  let idx = activeIdx;
  if (activeKey != null) {
    const matchIdx = items.findIndex((it) => it[keyField] === activeKey);
    if (matchIdx !== -1) idx = matchIdx;
  }
  if (idx < 0 || idx >= items.length) {
    idx = 0;
  }
  return idx;
}

/**
 * Computes a wrapped index when stepping forward or backward through a list.
 * @param {number} currentIndex - Current index (-1 if none).
 * @param {number} totalCount - Total number of items.
 * @param {number} delta - Step offset (+1 or -1).
 * @returns {number} Next valid index, or -1 if `totalCount <= 0`.
 */
export function stepIndex(currentIndex, totalCount, delta) {
  if (totalCount <= 0) return -1;
  const base = currentIndex < 0 ? 0 : currentIndex;
  return (base + delta + totalCount) % totalCount;
}
