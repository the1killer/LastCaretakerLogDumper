/**
 * Normalizes voyage logs JSON from either a raw array or a `{ build_number, data }` wrapper.
 * @param {*} json - Parsed JSON payload.
 * @returns {{buildNumber: string|null, logs: Array<object>}}
 */
export function normalizeLogs(json) {
  if (!json) return { buildNumber: null, logs: [] };
  if (Array.isArray(json)) return { buildNumber: null, logs: json };
  return { buildNumber: json.build_number || null, logs: json.data || [] };
}

/**
 * Normalizes JSON payloads that may be a raw array or a `{ data }` wrapper.
 * @param {*} json - Parsed JSON payload.
 * @returns {Array<object>}
 */
export function normalizeArrayJson(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data || [];
}

/**
 * Generates a stable page anchor key for a log fragment.
 * @param {object} fragment - Log fragment object.
 * @param {number} index - Zero-based fragment index.
 * @returns {string} Page key for URL hash deep-links.
 */
export function logPageKey(fragment, index) {
  return fragment && fragment.id ? `page:${fragment.id}` : `page:${index + 1}`;
}
