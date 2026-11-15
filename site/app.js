import { escapeHtml, formatDate, firstLine } from "./js/core/formatters.js";
import { copyText } from "./js/core/clipboard.js";
import { REPO, buildVersionList, isLocalEnvironment, createLocalVersionEntry } from "./js/api/github.js";
import { state, currentSelectedEntryKey, resolveVersionSha } from "./js/state/store.js";
import {
  parseAppHash,
  syncUrlHash,
  compareShareUrl,
  focusBrowseHashTarget,
} from "./js/state/router.js";
import {
  currentFilterValue,
  updateCopyLinkButton,
  currentEntryShareUrl,
  currentSelectionShareUrl,
  updateSelectionLinkButton,
  renderBrowseLogs,
  renderBrowseTimeline,
  renderBrowseSubs,
  renderSampleList,
  scrollSelectedEntryIntoView,
  applyBrowseScope,
  applySampleScope,
  loadBrowseVersion,
  selectBrowseEntryByKey,
} from "./js/ui/browse.js";
import { applyCompareScope, loadCompare } from "./js/ui/compare.js";
import { wireDeviceControls } from "./js/ui/device.js";

/**
 * Displays or clears the bottom status banner with optional error styling.
 * @param {string} text - Status message (empty string hides banner).
 * @param {boolean} [isError=false] - Whether to render as an error alert.
 */
export function setStatus(text, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", !!isError);
}

function populateVersionSelects({ preserveSelection = false } = {}) {
  const browseEl = document.getElementById("browse-version");
  const toEl = document.getElementById("compare-to");
  const fromEl = document.getElementById("compare-from");
  const prevBrowse = preserveSelection && browseEl ? browseEl.value : "";
  const prevTo = preserveSelection && toEl ? toEl.value : "";
  const prevFrom = preserveSelection && fromEl ? fromEl.value : "";

  const optionsHtml = state.versions
    .map(
      (v) =>
        `<option value="${escapeHtml(v.sha)}">${escapeHtml(formatDate(v.date))} · ${escapeHtml(firstLine(v.message))} (${escapeHtml(v.sha.slice(0, 7))})</option>`
    )
    .join("");
  for (const el of [browseEl, toEl, fromEl]) {
    if (el) el.innerHTML = optionsHtml;
  }

  const hasSha = (sha) => sha && state.versions.some((v) => v.sha === sha);
  if (browseEl) browseEl.value = hasSha(prevBrowse) ? prevBrowse : state.versions[0].sha;
  if (toEl) toEl.value = hasSha(prevTo) ? prevTo : state.versions[0].sha;
  if (fromEl) {
    const keepFrom = hasSha(prevFrom) && (state.currentMode === "compare" || prevFrom !== prevTo);
    fromEl.value = keepFrom ? prevFrom : (state.versions[1] || state.versions[0]).sha;
  }
}

/**
 * Switches between Browse and Compare top-level display modes.
 * @param {string} mode - `"browse"` or `"compare"`.
 * @param {object} [options]
 * @param {boolean} [options.syncHash=false] - Synchronize URL hash.
 * @param {boolean} [options.pushHistory=false] - Push a browser history entry.
 * @param {boolean} [options.loadDiff=true] - Trigger `loadCompare()` when entering compare mode.
 */
export function setMode(mode, options = {}) {
  const validMode = mode === "compare" ? "compare" : "browse";
  const { syncHash = false, pushHistory = false, loadDiff = true } = options;
  state.currentMode = validMode;

  document.querySelectorAll("#mode-tabs .tab").forEach((t) => {
    const isActive = t.dataset.mode === validMode;
    t.classList.toggle("active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.getElementById("panel-browse")?.classList.toggle("active", state.currentMode === "browse");
  document.getElementById("panel-compare")?.classList.toggle("active", state.currentMode === "compare");
  document.getElementById("browse-controls")?.classList.toggle("hidden", state.currentMode !== "browse");
  document.getElementById("compare-controls")?.classList.toggle("hidden", state.currentMode !== "compare");

  const filterInput = document.getElementById("filter-input");
  const terminalBar = document.getElementById("terminal-bar");
  if (state.currentMode === "compare") {
    terminalBar?.classList.add("disabled");
    if (filterInput) filterInput.placeholder = "Filtering is not available in compare mode";
  } else {
    terminalBar?.classList.remove("disabled");
    if (filterInput) {
      filterInput.placeholder =
        state.browseScope === "sampledata"
          ? "Type to filter sample data…"
          : state.browseScope === "timeline"
          ? "Type to filter timeline…"
          : "Type to filter entries…";
    }
  }
  updateCopyLinkButton();
  if (syncHash) syncUrlHash({ push: pushHistory });
  if (state.currentMode === "compare" && loadDiff) loadCompare(setStatus);
}

/**
 * Restores application state from the current URL hash (Browse or Compare mode).
 * @returns {Promise<boolean>} True if a valid hash route was applied.
 */
export async function applyAppHashState() {
  const route = parseAppHash();
  if (!route) return false;

  state.isApplyingHashState = true;
  try {
    if (route.mode === "compare") {
      setMode("compare", { syncHash: false, loadDiff: false });
      applyCompareScope(route.scope, { syncHash: false });

      const fromSelect = document.getElementById("compare-from");
      const toSelect = document.getElementById("compare-to");
      const fromSha = resolveVersionSha(route.from) || fromSelect?.value || "";
      const toSha = resolveVersionSha(route.to) || toSelect?.value || "";
      if (fromSelect && fromSha && fromSelect.value !== fromSha) fromSelect.value = fromSha;
      if (toSelect && toSha && toSelect.value !== toSha) toSelect.value = toSha;

      await loadCompare(setStatus);
      updateCopyLinkButton();
      return true;
    }

    setMode("browse", { syncHash: false });
    applyBrowseScope(route.scope, { resetFilter: true, syncHash: false });
    if (route.scope === "sampledata") {
      applySampleScope(route.sampleScope, { resetFilter: false, syncHash: false });
    }

    const browseSelect = document.getElementById("browse-version");
    const version = resolveVersionSha(route.version) || browseSelect?.value || "";
    if (browseSelect && version && browseSelect.value !== version) browseSelect.value = version;
    if (version && state.currentBrowseSha !== version) await loadBrowseVersion(version, setStatus);

    if (route.scope === "sampledata" && route.unlocked && route.entry) {
      state.unlockedSamples.add(route.entry);
    }
    if (route.entry) {
      const found = selectBrowseEntryByKey(route.scope, route.entry);
      if (found) {
        scrollSelectedEntryIntoView();
        if (route.page || route.text) requestAnimationFrame(() => focusBrowseHashTarget(route));
      }
    }
    updateCopyLinkButton();
    return true;
  } finally {
    state.isApplyingHashState = false;
  }
}

function wireModeTabs() {
  document.querySelectorAll("#mode-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode, { syncHash: true, pushHistory: true }));
  });
}

function wireBrowseContentTabs() {
  document.querySelectorAll("#browse-content-tabs .content-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrowseScope(btn.dataset.content, { resetFilter: true, syncHash: true, pushHistory: true });
    });
  });
}

function wireCompareContentTabs() {
  document.querySelectorAll("#compare-content-tabs .content-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyCompareScope(btn.dataset.content, { syncHash: true, pushHistory: true });
    });
  });
}

function wireSampleContentTabs() {
  document.querySelectorAll("#sampledata-content-tabs .content-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      applySampleScope(btn.dataset.content, { resetFilter: true, syncHash: true, pushHistory: true });
    });
  });
}

function wireEntryListClicks() {
  function bindSelection(containerId, getList, setIdx, setKey, renderFn) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const activateRow = (row) => {
      const idx = Number(row.dataset.idx);
      setIdx(idx);
      const list = getList();
      const item = list[idx];
      setKey(item?.id || item?.key || null);
      renderFn(currentFilterValue());
      const screens = document.querySelector(".screens");
      if (screens?.classList.contains("is-stacked")) {
        const detailScreen = document.querySelector(".detail-screen");
        detailScreen?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    container.addEventListener("click", (e) => {
      const row = e.target.closest(".entry");
      if (row) activateRow(row);
    });

    container.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const row = e.target.closest(".entry");
        if (row) {
          e.preventDefault();
          activateRow(row);
        }
      }
    });
  }

  bindSelection(
    "logs-list",
    () => state.filteredLogs,
    (idx) => { state.selectedLogIdx = idx; },
    (key) => { state.selectedLogKey = key; },
    renderBrowseLogs
  );
  bindSelection(
    "timeline-list",
    () => state.filteredTimeline,
    (idx) => { state.selectedTimelineIdx = idx; },
    (key) => { state.selectedTimelineKey = key; },
    renderBrowseTimeline
  );
  bindSelection(
    "subs-list",
    () => state.filteredSubGroups,
    (idx) => { state.selectedSubIdx = idx; },
    (key) => { state.selectedSubKey = key; },
    renderBrowseSubs
  );
  bindSelection(
    "sampledata-list",
    () => state.filteredSamples,
    (idx) => { state.selectedSampleIdx = idx; },
    (key) => { state.selectedSampleKey = key; },
    renderSampleList
  );
}

function wireFilterInput() {
  document.getElementById("filter-input")?.addEventListener("input", (e) => {
    if (state.currentMode !== "browse") return;
    if (state.browseScope === "logs") renderBrowseLogs(e.target.value);
    else if (state.browseScope === "timeline") renderBrowseTimeline(e.target.value);
    else if (state.browseScope === "subtitles") renderBrowseSubs(e.target.value);
    else renderSampleList(e.target.value);
  });
}

/**
 * Detects whether the list screen and detail screen are rendered in a stacked (above/below) layout
 * rather than side-by-side.
 * @param {HTMLElement} listScreen
 * @param {HTMLElement} detailScreen
 * @returns {boolean} True if detail is positioned below list.
 */
export function isScreenLayoutStacked(listScreen, detailScreen) {
  if (!listScreen || !detailScreen) return false;
  if (typeof detailScreen.offsetTop === "number" && typeof listScreen.offsetTop === "number") {
    if (detailScreen.offsetTop >= listScreen.offsetTop + 100) return true;
    if (detailScreen.offsetTop === listScreen.offsetTop) return false;
  }
  if (typeof detailScreen.getBoundingClientRect === "function" && typeof listScreen.getBoundingClientRect === "function") {
    const listRect = listScreen.getBoundingClientRect();
    const detailRect = detailScreen.getBoundingClientRect();
    if (detailRect.top >= listRect.bottom - 20) return true;
    if (Math.abs(detailRect.top - listRect.top) < 20 && detailRect.left >= listRect.right - 20) return false;
  }
  return false;
}

/**
 * Updates the `.is-stacked` class on `.screens` according to whether the screens are vertically
 * stacked (mobile/narrow view) or positioned side-by-side (desktop/wide view).
 */
export function updateStackedLayout() {
  const listScreen = document.getElementById("list-screen");
  const detailScreen = document.querySelector(".detail-screen");
  const screens = document.querySelector(".screens");
  const toggleBtn = document.getElementById("list-toggle-btn");
  if (!listScreen || !detailScreen || !screens) return;

  const isStacked = isScreenLayoutStacked(listScreen, detailScreen);
  screens.classList.toggle("is-stacked", isStacked);

  if (!isStacked) {
    listScreen.classList.remove("mobile-expanded");
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.textContent = "EXPAND ▾";
    }
  }
}

function wireMobileListToggle() {
  const listScreen = document.getElementById("list-screen");
  const header = document.getElementById("list-screen-header");
  const toggleBtn = document.getElementById("list-toggle-btn");
  const screens = document.querySelector(".screens");
  if (!listScreen || !header || !toggleBtn) return;

  const toggle = () => {
    if (!screens?.classList.contains("is-stacked")) return;
    const expanded = listScreen.classList.toggle("mobile-expanded");
    toggleBtn.setAttribute("aria-expanded", String(expanded));
    toggleBtn.textContent = expanded ? "COLLAPSE ▴" : "EXPAND ▾";
  };

  header.addEventListener("click", (e) => {
    if (!screens?.classList.contains("is-stacked")) return;
    if (e.target === toggleBtn || header.contains(e.target)) {
      toggle();
    }
  });

  updateStackedLayout();
  window.addEventListener("resize", updateStackedLayout);
  if (typeof ResizeObserver !== "undefined" && screens) {
    new ResizeObserver(updateStackedLayout).observe(screens);
  }
}

function wireShareLinkButton() {
  document.getElementById("copy-link-btn")?.addEventListener("click", async () => {
    if (state.currentMode === "compare") {
      try {
        await copyText(compareShareUrl());
        setStatus("Compare link copied to clipboard.");
        window.setTimeout(() => setStatus(""), 1500);
      } catch (err) {
        console.error(err);
        setStatus("Unable to copy compare link to clipboard. Please copy the URL directly from your browser.", true);
      }
      return;
    }
    if (state.currentMode !== "browse" || !currentSelectedEntryKey()) return;
    try {
      await copyText(currentEntryShareUrl());
      setStatus("Entry link copied to clipboard.");
      window.setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      console.error(err);
      setStatus("Unable to copy link to clipboard. Please copy the URL directly from your browser.", true);
    }
  });

  const selectionBtn = document.getElementById("selection-link-btn");
  selectionBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  selectionBtn?.addEventListener("click", async () => {
    if (!state.activeSelectionContext) return;
    try {
      await copyText(currentSelectionShareUrl());
      setStatus("Selection link copied to clipboard.");
      window.setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      console.error(err);
      setStatus("Unable to copy selection link to clipboard. Please copy the URL directly from your browser.", true);
    }
  });

  document.addEventListener("selectionchange", () => {
    updateCopyLinkButton();
    updateSelectionLinkButton();
  });
  window.addEventListener("scroll", updateSelectionLinkButton, true);
  window.addEventListener("resize", updateSelectionLinkButton);
}

/**
 * Bootstraps the web archive UI, loads commit/local versions, and applies initial URL route state.
 */
export async function init() {
  if (!REPO) {
    setStatus(
      "Repository not specified. Add '?repo=owner/repo' to the URL (for example, '?repo=the1killer/LastCaretakerLogDumper') to load archive data.",
      true
    );
    return;
  }

  wireModeTabs();
  wireBrowseContentTabs();
  wireCompareContentTabs();
  wireSampleContentTabs();
  wireEntryListClicks();
  wireFilterInput();
  wireMobileListToggle();
  wireShareLinkButton();
  wireDeviceControls(setStatus);

  const initialHash = parseAppHash(location.hash);
  const localFastPath =
    isLocalEnvironment() &&
    initialHash?.mode !== "compare" &&
    (!initialHash?.version || initialHash.version === "local");
  if (localFastPath) {
    state.versions = [createLocalVersionEntry()];
    populateVersionSelects();
  } else {
    setStatus("Loading commit history…");
    try {
      state.versions = await buildVersionList();
      if (!state.versions.length) {
        throw new Error("No commit history found for data dump files in this repository. Ensure the repository path is correct.");
      }
      populateVersionSelects();
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
      return;
    }
  }

  document.getElementById("browse-version")?.addEventListener("change", async (e) => {
    await loadBrowseVersion(e.target.value, setStatus);
    syncUrlHash({ push: true });
  });
  document.getElementById("compare-from")?.addEventListener("change", async () => {
    syncUrlHash({ push: true });
    await loadCompare(setStatus);
  });
  document.getElementById("compare-to")?.addEventListener("change", async () => {
    syncUrlHash({ push: true });
    await loadCompare(setStatus);
  });

  let activeNavTarget = null;
  const handleNavigation = () => {
    const targetHash = location.hash;
    if (state.isApplyingHashState && targetHash === activeNavTarget) return;
    activeNavTarget = targetHash;
    applyAppHashState()
      .catch((err) => {
        console.error(err);
        setStatus(err.message, true);
      })
      .finally(() => {
        if (activeNavTarget === targetHash) activeNavTarget = null;
      });
  };
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener("popstate", handleNavigation);

  if (!(await applyAppHashState())) {
    const browseSelect = document.getElementById("browse-version");
    if (browseSelect) await loadBrowseVersion(browseSelect.value, setStatus);
  }
  updateStackedLayout();

  if (localFastPath) {
    buildVersionList()
      .then((versions) => {
        if (!versions.length) return;
        state.versions = versions;
        populateVersionSelects({ preserveSelection: true });
      })
      .catch((err) => console.warn("Background commit history load failed:", err));
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
