import { escapeHtml } from "../core/formatters.js";

/**
 * Performs deep structural equality comparison on JSON-compatible values
 * without allocating serialized strings via `JSON.stringify`.
 * @param {*} a - First value.
 * @param {*} b - Second value.
 * @returns {boolean} True when structurally equal.
 */
export function isDeepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, k) || !isDeepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Renders word-level inline HTML diff markup using global `Diff.diffWords`,
 * falling back to escaped arrow notation if `Diff` is unavailable.
 * @param {string} oldText - Previous text.
 * @param {string} newText - Updated text.
 * @returns {string} HTML string with `<ins>` / `<del>` tags.
 */
export function renderWordDiff(oldText, newText) {
  oldText = oldText || "";
  newText = newText || "";
  if (oldText === newText) return escapeHtml(newText);
  if (typeof Diff === "undefined") {
    return `${escapeHtml(oldText)} → ${escapeHtml(newText)}`;
  }
  return Diff.diffWords(oldText, newText)
    .map((part) => {
      const text = escapeHtml(part.value);
      if (part.added) return `<ins class="diff-ins">${text}</ins>`;
      if (part.removed) return `<del class="diff-del">${text}</del>`;
      return text;
    })
    .join("");
}

/**
 * Computes added, removed, and changed items between two arrays keyed by `keyFn`.
 * @param {Array<object>} fromList - Base array.
 * @param {Array<object>} toList - Target array.
 * @param {function(object): string} keyFn - Key selector function.
 * @returns {{added: Array<object>, removed: Array<object>, changed: Array<{key: string, from: object, to: object}>}}
 */
export function diffByKey(fromList, toList, keyFn) {
  const fromMap = new Map(fromList.map((x) => [keyFn(x), x]));
  const toMap = new Map(toList.map((x) => [keyFn(x), x]));
  const added = [...toMap.keys()].filter((k) => !fromMap.has(k)).map((k) => toMap.get(k));
  const removed = [...fromMap.keys()].filter((k) => !toMap.has(k)).map((k) => fromMap.get(k));
  const changed = [];
  for (const k of toMap.keys()) {
    if (!fromMap.has(k)) continue;
    const a = fromMap.get(k);
    const b = toMap.get(k);
    if (!isDeepEqual(a, b)) changed.push({ key: k, from: a, to: b });
  }
  return { added, removed, changed };
}
