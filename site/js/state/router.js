import { hashValue, normalizeSelectedText, trimmedSelectionText, selectorValue } from "../core/formatters.js";
import { isValidVersionSha } from "../api/github.js";
import { VALID_SAMPLE_SCOPES } from "../domain/sampledata.js";
import { state, currentSelectedEntryKey, SCOPE_TITLES, COMPARE_SCOPE_TITLES } from "./store.js";

/**
 * Truncates a commit SHA to 7 characters (preserving `"local"` as-is).
 * @param {string} sha - Commit SHA or `"local"`.
 * @returns {string} Short SHA string.
 */
export function shortSha(sha) {
  return String(sha || "").slice(0, 7);
}

/**
 * Builds the URL hash query string representing the current Browse mode state.
 * @param {object} [extra] - Optional `page` and `text` selection anchor overrides.
 * @returns {string} Serialized URLSearchParams string.
 */
export function buildBrowseHash(extra = {}) {
  const params = new URLSearchParams();
  params.set("mode", "browse");
  params.set("scope", state.browseScope);
  if (state.currentBrowseSha) params.set("version", shortSha(state.currentBrowseSha));
  const entryKey = hashValue(currentSelectedEntryKey());
  if (entryKey) params.set("entry", entryKey);
  if (state.browseScope === "sampledata") params.set("sampleScope", state.sampleScope);
  if (extra.page) params.set("page", extra.page);
  if (extra.text) params.set("text", extra.text);
  if (state.browseScope === "sampledata" && state.unlockedSamples.has(entryKey)) params.set("unlocked", "1");
  return params.toString();
}

/**
 * Builds the URL hash query string representing the current Compare mode state.
 * @returns {string} Serialized URLSearchParams string.
 */
export function buildCompareHash() {
  const params = new URLSearchParams();
  params.set("mode", "compare");
  params.set("scope", state.compareScope);
  if (typeof document !== "undefined") {
    const fromSha = document.getElementById("compare-from")?.value;
    const toSha = document.getElementById("compare-to")?.value;
    if (fromSha) params.set("from", shortSha(fromSha));
    if (toSha) params.set("to", shortSha(toSha));
  }
  return params.toString();
}

/**
 * Builds the URL hash query string for whichever mode (`browse` or `compare`) is active.
 * @param {object} [extra] - Optional selection anchor overrides for Browse mode.
 * @returns {string} Serialized URLSearchParams string.
 */
export function buildCurrentHash(extra = {}) {
  return state.currentMode === "compare" ? buildCompareHash() : buildBrowseHash(extra);
}

/**
 * Synchronizes the browser URL hash with application state using `pushState` or `replaceState`.
 * No-ops while applying hash state from navigation events.
 * @param {object} [options]
 * @param {boolean} [options.push=false] - Push a new history entry when true, else replace.
 * @param {object} [options.extra={}] - Optional selection anchor overrides.
 */
export function syncUrlHash(options = {}) {
  if (state.isApplyingHashState || typeof history === "undefined" || typeof location === "undefined") return;
  const { push = false, extra = {} } = options;
  const hash = buildCurrentHash(extra);
  const suffix = hash ? `#${hash}` : "";
  const targetUrl = `${location.pathname}${location.search}${suffix}`;
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  if (targetUrl === currentUrl) return;
  if (push) {
    history.pushState(null, "", targetUrl);
  } else {
    history.replaceState(null, "", targetUrl);
  }
}

/**
 * Replaces the current URL hash for Browse mode selection changes.
 * @param {object} [extra] - Optional selection anchor overrides.
 */
export function writeBrowseHash(extra = {}) {
  if (state.currentMode !== "browse") return;
  syncUrlHash({ push: false, extra });
}

/**
 * Parses and validates the URL hash into a structured route state for Browse or Compare mode.
 * Validates `mode`, `scope`, `sampleScope`, and SHA/`"local"` version parameters.
 * @param {string} [rawHash] - Hash string (defaults to `location.hash`).
 * @returns {object|null} Validated route state object, or `null` if hash is empty/invalid.
 */
export function parseAppHash(rawHash = typeof location !== "undefined" ? location.hash : "") {
  const raw = String(rawHash || "").replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const rawMode = params.get("mode") || "browse";
  if (rawMode !== "browse" && rawMode !== "compare") return null;

  if (rawMode === "compare") {
    const rawScope = params.get("scope");
    const rawFrom = params.get("from") || "";
    const rawTo = params.get("to") || "";
    return {
      mode: "compare",
      scope: COMPARE_SCOPE_TITLES[rawScope] ? rawScope : "logs",
      from: isValidVersionSha(rawFrom) ? rawFrom : "",
      to: isValidVersionSha(rawTo) ? rawTo : "",
    };
  }

  const rawScope = params.get("scope");
  const rawVersion = params.get("version") || "";
  const rawSampleScope = params.get("sampleScope") || "all";
  return {
    mode: "browse",
    scope: SCOPE_TITLES[rawScope] ? rawScope : "logs",
    version: isValidVersionSha(rawVersion) ? rawVersion : "",
    entry: params.get("entry") || "",
    page: params.get("page") || "",
    text: trimmedSelectionText(params.get("text") || ""),
    sampleScope: VALID_SAMPLE_SCOPES.has(rawSampleScope) ? rawSampleScope : "all",
    unlocked: params.get("unlocked") === "1",
  };
}

/**
 * Parses the URL hash only when in Browse mode.
 * @param {string} [rawHash] - Hash string (defaults to `location.hash`).
 * @returns {object|null} Browse route state or `null`.
 */
export function parseBrowseHash(rawHash) {
  const parsed = parseAppHash(rawHash);
  return parsed && parsed.mode === "browse" ? parsed : null;
}

/**
 * Builds a shareable full URL for the current Browse selection.
 * @param {object} [extra] - Optional `page` and `text` selection anchor overrides.
 * @returns {string} Full share URL.
 */
export function browseShareUrl(extra = {}) {
  const hash = buildBrowseHash(extra);
  return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

/**
 * Builds a shareable full URL for the current Compare view.
 * @returns {string} Full share URL.
 */
export function compareShareUrl() {
  const hash = buildCompareHash();
  return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

/**
 * Returns the active Browse detail DOM container for the current scope.
 * @returns {HTMLElement|null}
 */
export function getActiveDetailPane() {
  return state.browseScope === "sampledata"
    ? document.getElementById("sampledata-detail-pane")
    : document.getElementById("detail-pane");
}

/**
 * Finds the first text node under `root` matching `snippet` (whitespace-normalized, case-insensitive).
 * @param {Node} root - Root DOM node.
 * @param {string} snippet - Search snippet.
 * @returns {{node: Text, start: number, end: number}|null}
 */
export function findTextNodeMatch(root, snippet) {
  const needle = normalizeSelectedText(snippet).toLowerCase();
  if (!root || !needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = node.nodeValue || "";
    let normalized = "";
    const rawIndices = [];
    let pendingSpace = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (/\s/.test(ch)) {
        pendingSpace = normalized.length > 0;
        continue;
      }
      if (pendingSpace) {
        normalized += " ";
        rawIndices.push(i);
        pendingSpace = false;
      }
      normalized += ch;
      rawIndices.push(i);
    }
    normalized = normalized.toLowerCase();
    const idx = normalized.indexOf(needle);
    if (idx === -1) continue;
    const rawStart = rawIndices[idx];
    const rawEnd = rawIndices[idx + needle.length - 1];
    if (rawStart != null && rawEnd != null) return { node, start: rawStart, end: rawEnd + 1 };
  }
  return null;
}

/**
 * Removes existing `<mark class="link-mark">` highlights inside `root` and normalizes text nodes.
 * @param {Element|null} root - Root container element.
 */
export function clearLinkedTextMarks(root) {
  if (!root) return;
  root.querySelectorAll("mark.link-mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

/**
 * Highlights and scrolls to the first matching text snippet inside `root`.
 * @param {Element|null} root - Root container element.
 * @param {string} text - Snippet to highlight.
 * @returns {boolean} True if highlighted.
 */
export function highlightLinkedText(root, text) {
  clearLinkedTextMarks(root);
  const match = findTextNodeMatch(root, text);
  if (!match) return false;
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  const mark = document.createElement("mark");
  mark.className = "link-mark";
  range.surroundContents(mark);
  mark.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/**
 * Scrolls to and highlights deep-linked page/text targets in the active detail pane.
 * @param {{page?: string, text?: string}} targetState - Parsed deep-link state.
 */
export function focusBrowseHashTarget(targetState) {
  const pane = getActiveDetailPane();
  if (!pane) return;
  let target = pane;
  if (targetState.page) {
    const el = pane.querySelector(`[data-link-page="${selectorValue(targetState.page)}"]`);
    if (el) target = el;
  }
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (targetState.text) highlightLinkedText(target, targetState.text) || highlightLinkedText(pane, targetState.text);
}
