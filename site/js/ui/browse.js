import { escapeHtml, formatDuration, clamp, trimmedSelectionText, resolveSelectedIndex } from "../core/formatters.js";
import { PATHS, fetchFileAtSha } from "../api/github.js";
import { state, currentSelectedEntryKey, SCOPE_TITLES } from "../state/store.js";
import { normalizeLogs, normalizeArrayJson, logPageKey } from "../domain/logs.js";
import { buildTimelineEvents } from "../domain/timeline.js";
import { groupSubtitles, subtitlePartLabel, subtitlePageKey } from "../domain/subtitles.js";
import { sampleCode, sampleSiteLabel, sampleImageUrl, mergeSampleDataText, VALID_SAMPLE_SCOPES } from "../domain/sampledata.js";
import { syncUrlHash, writeBrowseHash, browseShareUrl, getActiveDetailPane, shortSha } from "../state/router.js";

/**
 * Returns the current search filter input value.
 * @returns {string}
 */
export function currentFilterValue() {
  return document.getElementById("filter-input")?.value || "";
}

/**
 * Renders a single accessible master-list option row.
 * @param {number} idx - Row index in the filtered list.
 * @param {string} title - Display title.
 * @param {string} badge - Right-aligned badge text.
 * @param {boolean} isSelected - Whether the row is currently selected.
 * @returns {string} HTML markup for the row.
 */
export function entryRowHtml(idx, title, badge, isSelected) {
  return `<div class="entry ${isSelected ? "selected" : ""}" data-idx="${idx}" role="option" aria-selected="${isSelected ? "true" : "false"}" tabindex="0">
    <span class="entry-title">${escapeHtml(title) || "<em>(untitled)</em>"}</span>
    <span class="entry-badge">${escapeHtml(badge)}</span>
  </div>`;
}

/**
 * Updates tab selection states, list visibility, and pane titles for the given Browse scope.
 * @param {string} scope - One of `"logs"`, `"timeline"`, `"subtitles"`, `"sampledata"`.
 */
export function setBrowseModeUi(scope) {
  const title = document.getElementById("list-screen-title");
  document.querySelectorAll("#browse-content-tabs .content-tab").forEach((btn) => {
    const isActive = btn.dataset.content === scope;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.getElementById("logs-list")?.classList.toggle("hidden", scope !== "logs");
  document.getElementById("timeline-list")?.classList.toggle("hidden", scope !== "timeline");
  document.getElementById("subs-list")?.classList.toggle("hidden", scope !== "subtitles");
  document.getElementById("sampledata-list")?.classList.toggle("hidden", scope !== "sampledata");
  document.getElementById("detail-pane")?.classList.toggle("hidden", scope === "sampledata");
  document.getElementById("sampledata-detail-pane")?.classList.toggle("hidden", scope !== "sampledata");
  document.getElementById("sampledata-content-tabs")?.classList.toggle("hidden", scope !== "sampledata");
  if (title) title.textContent = SCOPE_TITLES[scope] || SCOPE_TITLES.logs;
}

/**
 * Updates tab active and ARIA states for Sample Data sub-filters.
 * @param {string} scope - One of `"all"`, `"field"`, `"cave"`.
 */
export function setSampleScopeUi(scope) {
  document.querySelectorAll("#sampledata-content-tabs .content-tab").forEach((btn) => {
    const isActive = btn.dataset.content === scope;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

/**
 * Updates the toolbar permalink button label and enabled state based on current mode/selection.
 */
export function updateCopyLinkButton() {
  const btn = document.getElementById("copy-link-btn");
  if (!btn) return;
  if (state.currentMode === "compare") {
    btn.disabled = false;
    btn.textContent = "COPY COMPARE LINK";
    return;
  }
  const entryKey = currentSelectedEntryKey();
  btn.disabled = state.currentMode !== "browse" || !entryKey;
  btn.textContent = "COPY ENTRY LINK";
}

/**
 * Hides the floating text-selection link button and clears selection context.
 */
export function hideSelectionLinkButton() {
  state.activeSelectionContext = null;
  document.getElementById("selection-link-btn")?.classList.add("hidden");
}

/**
 * Inspects the current browser text selection inside the active detail pane.
 * @returns {{page: string, text: string}|null} Selection anchor context or `null`.
 */
export function getDetailSelectionContext() {
  if (state.currentMode !== "browse") return null;
  const pane = getActiveDetailPane();
  const selection = window.getSelection();
  if (!pane || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!container || !pane.contains(container)) return null;

  const text = trimmedSelectionText(selection.toString());
  if (!text) return null;
  const pageEl = container.closest("[data-link-page]");
  return {
    page: pageEl?.dataset.linkPage || "",
    text,
  };
}

/**
 * Returns the share URL for the currently selected Browse entry.
 * @returns {string}
 */
export function currentEntryShareUrl() {
  return browseShareUrl();
}

/**
 * Returns the share URL for the currently highlighted text selection.
 * @returns {string}
 */
export function currentSelectionShareUrl() {
  return browseShareUrl(state.activeSelectionContext || getDetailSelectionContext() || {});
}

function selectionButtonRect(range) {
  const rects = Array.from(range.getClientRects());
  return rects[rects.length - 1] || range.getBoundingClientRect();
}

let selectionRafId = null;

/**
 * Positions the floating selection-link button next to the active detail selection,
 * coalescing rapid scroll/selection/resize updates with `requestAnimationFrame`.
 */
export function updateSelectionLinkButton() {
  if (selectionRafId != null) cancelAnimationFrame(selectionRafId);
  selectionRafId = requestAnimationFrame(() => {
    selectionRafId = null;
    const btn = document.getElementById("selection-link-btn");
    if (!btn) return;
    const selection = window.getSelection();
    const context = getDetailSelectionContext();
    if (state.currentMode !== "browse" || !context || !selection || selection.rangeCount === 0) {
      hideSelectionLinkButton();
      return;
    }

    state.activeSelectionContext = context;
    const rect = selectionButtonRect(selection.getRangeAt(0));
    if (!rect || (!rect.width && !rect.height)) {
      hideSelectionLinkButton();
      return;
    }

    btn.classList.remove("hidden");
    const margin = 10;
    const width = btn.offsetWidth;
    const height = btn.offsetHeight;
    const left = clamp(rect.right - width / 2, margin, window.innerWidth - width - margin);
    const top = clamp(rect.bottom + 8, margin, window.innerHeight - height - margin);
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
  });
}

/**
 * Syncs URL hash and share-link buttons after a Browse selection update.
 */
export function syncBrowseSelectionHash() {
  writeBrowseHash();
  updateCopyLinkButton();
  updateSelectionLinkButton();
}

/**
 * Scrolls the selected entry row into view in the active Browse list.
 */
export function scrollSelectedEntryIntoView() {
  if (state.browseScope === "logs") document.querySelector("#logs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else if (state.browseScope === "timeline") document.querySelector("#timeline-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else if (state.browseScope === "subtitles") document.querySelector("#subs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else document.querySelector("#sampledata-list .entry.selected")?.scrollIntoView({ block: "nearest" });
}

/**
 * Filters and renders the Voyage Logs master list and updates the detail pane when active.
 * @param {string} filterText - Search query text.
 */
export function renderBrowseLogs(filterText) {
  const term = (filterText || "").toLowerCase();
  state.filteredLogs = state.currentBrowseLogs.filter(
    (l) => !term || (l._haystack || (l._haystack = `${l.title || ""} ${l.id || ""}`.toLowerCase())).includes(term)
  );
  state.selectedLogIdx = resolveSelectedIndex(state.filteredLogs, "id", state.selectedLogKey, state.selectedLogIdx);
  state.selectedLogKey = state.filteredLogs[state.selectedLogIdx]?.id || null;

  const container = document.getElementById("logs-list");
  if (container) {
    container.innerHTML = state.filteredLogs.length
      ? state.filteredLogs
          .map((l, i) => {
            const count = (l.fragments || []).length;
            return entryRowHtml(i, l.title, `${count} ${count === 1 ? "PAGE" : "PAGES"}`, i === state.selectedLogIdx);
          })
          .join("")
      : `<p class="empty-note">No voyage logs match your filter. Try adjusting your search term or clearing the filter.</p>`;
  }

  if (state.browseScope === "logs") {
    const countEl = document.getElementById("list-count");
    if (countEl) countEl.textContent = `${state.filteredLogs.length}/${state.currentBrowseLogs.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

/**
 * Filters and renders the chronological Timeline master list and updates the detail pane when active.
 * @param {string} filterText - Search query text.
 */
export function renderBrowseTimeline(filterText) {
  const term = (filterText || "").toLowerCase();
  state.filteredTimeline = state.timelineEvents.filter((ev) => !term || ev._haystack.includes(term));
  state.selectedTimelineIdx = resolveSelectedIndex(state.filteredTimeline, "key", state.selectedTimelineKey, state.selectedTimelineIdx);
  state.selectedTimelineKey = state.filteredTimeline[state.selectedTimelineIdx]?.key || null;

  const container = document.getElementById("timeline-list");
  if (container) {
    container.innerHTML = state.filteredTimeline.length
      ? state.filteredTimeline
          .map((ev, i) => entryRowHtml(i, ev.fragmentTitle || ev.logTitle, ev.displayDate, i === state.selectedTimelineIdx))
          .join("")
      : `<p class="empty-note">No timeline entries match your filter. Try adjusting your search term or clearing the filter.</p>`;
  }

  if (state.browseScope === "timeline") {
    const countEl = document.getElementById("list-count");
    if (countEl) countEl.textContent = `${state.filteredTimeline.length}/${state.timelineEvents.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

/**
 * Filters and renders the Quest Subtitles master list using pre-grouped storylines.
 * @param {string} filterText - Search query text.
 */
export function renderBrowseSubs(filterText) {
  const term = (filterText || "").toLowerCase();
  const groups = state.groupedBrowseSubs;
  state.filteredSubGroups = !term ? groups : groups.filter((g) => g.haystack.includes(term));
  state.selectedSubIdx = resolveSelectedIndex(state.filteredSubGroups, "key", state.selectedSubKey, state.selectedSubIdx);
  state.selectedSubKey = state.filteredSubGroups[state.selectedSubIdx]?.key || null;

  const container = document.getElementById("subs-list");
  if (container) {
    container.innerHTML = state.filteredSubGroups.length
      ? state.filteredSubGroups
          .map((g, i) => {
            const count = g.items.length;
            return entryRowHtml(i, g.key, `${count} ${count === 1 ? "LINE" : "LINES"}`, i === state.selectedSubIdx);
          })
          .join("")
      : `<p class="empty-note">No quest subtitles match your filter. Try adjusting your search term or clearing the filter.</p>`;
  }

  if (state.browseScope === "subtitles") {
    const countEl = document.getElementById("list-count");
    if (countEl) countEl.textContent = `${state.filteredSubGroups.length}/${groups.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

/**
 * Renders the detail pane for the currently selected Voyage Log.
 */
export function renderLogDetail() {
  const pane = document.getElementById("detail-pane");
  if (!pane) return;
  const log = state.filteredLogs[state.selectedLogIdx];
  if (!log) {
    pane.innerHTML = `<p class="empty-note">Select a voyage log from the list to view its description and fragments.</p>`;
    return;
  }
  const fragments = (log.fragments || [])
    .map(
      (f, index) => `<div class="fragment" data-link-page="${escapeHtml(logPageKey(f, index))}">
        <div class="fragment-title">${escapeHtml(f.title)}</div>
        <p>${escapeHtml(f.description)}</p>
      </div>`
    )
    .join("");
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(log.title) || "(untitled)"} ${state.selectedLogIdx + 1}/${state.filteredLogs.length}</div>
    <div class="detail-head-2">${escapeHtml(log.id)}</div>
    ${log.description ? `<p class="detail-intro" data-link-page="intro">${escapeHtml(log.description)}</p>` : ""}
    ${fragments}
    ${log.footer ? `<p class="footer-text" data-link-page="footer">${escapeHtml(log.footer)}</p>` : ""}
  `;
}

/**
 * Renders the detail pane for the currently selected Timeline event.
 */
export function renderTimelineDetail() {
  const pane = document.getElementById("detail-pane");
  if (!pane) return;
  const ev = state.filteredTimeline[state.selectedTimelineIdx];
  if (!ev) {
    pane.innerHTML = `<p class="empty-note">Select a timeline event from the list to view its entry details.</p>`;
    return;
  }
  let logLinkHtml = "";
  if (!ev.isAsset && ev.logId) {
    const params = new URLSearchParams({ mode: "browse", scope: "logs" });
    if (state.currentBrowseSha) params.set("version", shortSha(state.currentBrowseSha));
    params.set("entry", ev.logId);
    if (ev.pageKey) params.set("page", ev.pageKey);
    logLinkHtml = `<div class="timeline-actions"><a class="device-btn unlock-btn timeline-log-link" href="#${escapeHtml(params.toString())}">View in Voyage Logs</a></div>`;
  }
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(ev.displayDate)} — ${escapeHtml(ev.fragmentTitle || ev.logTitle)} ${state.selectedTimelineIdx + 1}/${state.filteredTimeline.length}</div>
    <div class="detail-head-2">${escapeHtml(ev.logTitle)}</div>
    <div class="fragment" data-link-page="${escapeHtml(ev.pageKey)}">
      ${ev.fragmentTitle ? `<div class="fragment-title">${escapeHtml(ev.fragmentTitle)}</div>` : ""}
      <p>${escapeHtml(ev.fragmentDesc)}</p>
    </div>
    ${logLinkHtml}
  `;
}

/**
 * Renders the detail pane for the currently selected Quest Subtitle storyline.
 */
export function renderSubDetail() {
  const pane = document.getElementById("detail-pane");
  if (!pane) return;
  const group = state.filteredSubGroups[state.selectedSubIdx];
  if (!group) {
    pane.innerHTML = `<p class="empty-note">Select a quest subtitle group from the list to view its lines.</p>`;
    return;
  }
  const lines = group.items
    .map(
      (s) => `<div class="fragment" data-link-page="${escapeHtml(subtitlePageKey(s))}">
        <div class="fragment-title">Part ${escapeHtml(subtitlePartLabel(s.Name)) || "?"} <span class="muted">${formatDuration(s.Duration)}</span></div>
        <p>${escapeHtml(s.Subtitle)}</p>
      </div>`
    )
    .join("");
  const count = group.items.length;
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(group.key)} ${state.selectedSubIdx + 1}/${state.filteredSubGroups.length}</div>
    <div class="detail-head-2">${count} ${count === 1 ? "line" : "lines"} · ${formatDuration(group.totalDuration)}</div>
    ${lines}
  `;
}

/**
 * Renders the appropriate detail pane for the active Browse scope.
 */
export function renderDetail() {
  if (state.browseScope === "logs") renderLogDetail();
  else if (state.browseScope === "timeline") renderTimelineDetail();
  else if (state.browseScope === "subtitles") renderSubDetail();
}

/**
 * Filters and renders the Sample Data master list and updates the detail pane when active.
 * @param {string} filterText - Search query text.
 */
export function renderSampleList(filterText) {
  const term = (filterText || "").toLowerCase();
  state.filteredSamples = state.sampleData.filter((it) => {
    const matchesScope = state.sampleScope === "all" || it.collection === state.sampleScope;
    const hay = it._haystack || (it._haystack = `${it.title} ${it.short} ${it.site || ""}`.toLowerCase());
    const matchesTerm = !term || hay.includes(term);
    return matchesScope && matchesTerm;
  });
  state.selectedSampleIdx = resolveSelectedIndex(state.filteredSamples, "id", state.selectedSampleKey, state.selectedSampleIdx);
  state.selectedSampleKey = state.filteredSamples[state.selectedSampleIdx]?.id || null;

  const container = document.getElementById("sampledata-list");
  if (container) {
    container.innerHTML = state.filteredSamples.length
      ? state.filteredSamples
          .map((it, i) => entryRowHtml(i, it.title, sampleCode(it), i === state.selectedSampleIdx))
          .join("")
      : `<p class="empty-note">No sample data matches your filter. Try adjusting your search term or clearing the filter.</p>`;
  }

  if (state.browseScope === "sampledata") {
    const countEl = document.getElementById("list-count");
    if (countEl) countEl.textContent = `${state.filteredSamples.length}/${state.sampleData.length}`;
    renderSampleDetail();
    syncBrowseSelectionHash();
  }
}

/**
 * Renders the detail pane for the currently selected Sample Data record.
 */
export function renderSampleDetail() {
  const pane = document.getElementById("sampledata-detail-pane");
  if (!pane) return;
  const it = state.filteredSamples[state.selectedSampleIdx];
  if (!it) {
    pane.innerHTML = `<p class="empty-note">Select a sample data record to inspect its field readings and memory payload.</p>`;
    return;
  }

  // Not every id has a recovered texture (e.g. "Bed on Wheels") -- rather than
  // tracking that in data.json, just attempt the image and fall back on error.
  const imgUrl = sampleImageUrl(it, state.currentBrowseSha);
  const media = imgUrl
    ? `<div class="framebuffer" id="sample-framebuffer">
        <img id="sample-image" src="${imgUrl}" alt="${escapeHtml(it.title)}" loading="lazy">
        <div class="framebuffer-cap">FRAMEBUFFER // ${sampleCode(it)}.CAP</div>
      </div>
      <div class="fb-missing hidden" id="sample-image-missing">[ NO CAPTURE ON RECORD ]<br>scan exists in log only — image was never recovered</div>`
    : `<div class="fb-missing">[ NO CAPTURE ON RECORD ]<br>scan exists in log only — image was never recovered</div>`;

  const isUnlocked = state.unlockedSamples.has(it.id);
  let lockHtml;
  if (!it.unlock) {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; memory status: <span class="muted">N/A</span></div>
      <p class="unlock-empty">No deeper memory was reconstructed from this scan.</p>
    </div>`;
  } else if (isUnlocked) {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; decrypting payload...... <span class="ok-tag">[OK]</span></div>
      <div class="section-label">Unlocked memory</div>
      <p class="unlock-text">${escapeHtml(it.unlock)}</p>
    </div>`;
  } else {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; memory status: <span class="locked-tag">LOCKED</span></div>
      <button class="device-btn unlock-btn" type="button" id="inline-unlock">Unlock memory</button>
    </div>`;
  }

  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(it.title)} ${state.selectedSampleIdx + 1}/${state.filteredSamples.length}</div>
    <div class="detail-head-2">${sampleCode(it)} · ${escapeHtml(sampleSiteLabel(it))}</div>
    ${media}
    <div class="section-label">Field reading</div>
    <p data-link-page="field-reading">${escapeHtml(it.short)}</p>
    ${lockHtml}
  `;

  const btn = document.getElementById("inline-unlock");
  if (btn) btn.addEventListener("click", () => unlockSample(it.id));

  const img = document.getElementById("sample-image");
  if (img) {
    img.addEventListener(
      "error",
      () => {
        document.getElementById("sample-framebuffer")?.classList.add("hidden");
        document.getElementById("sample-image-missing")?.classList.remove("hidden");
      },
      { once: true }
    );
  }
}

/**
 * Unlocks the memory payload for a Sample Data record using O(1) indexed lookup.
 * @param {string} id - Sample record ID.
 */
export function unlockSample(id) {
  const it = state.sampleDataById.get(id);
  if (!it || !it.unlock) return;
  state.unlockedSamples.add(id);
  renderSampleDetail();
  syncBrowseSelectionHash();
}

/**
 * Switches the active Browse content scope (`logs`, `timeline`, `subtitles`, `sampledata`).
 * @param {string} scope - Target scope.
 * @param {object} [options]
 * @param {boolean} [options.resetFilter=true] - Clear search filter input.
 * @param {boolean} [options.syncHash=true] - Synchronize URL hash.
 * @param {boolean} [options.pushHistory=false] - Push a browser history entry.
 */
export function applyBrowseScope(scope, options = {}) {
  const validScope = SCOPE_TITLES[scope] ? scope : "logs";
  const { resetFilter = true, syncHash = true, pushHistory = false } = options;
  state.browseScope = validScope;
  setBrowseModeUi(validScope);

  const filterInput = document.getElementById("filter-input");
  if (filterInput) {
    if (resetFilter) filterInput.value = "";
    filterInput.placeholder =
      validScope === "sampledata"
        ? "Type to filter sample data…"
        : validScope === "timeline"
        ? "Type to filter timeline…"
        : "Type to filter entries…";
  }

  const val = currentFilterValue();
  if (validScope === "logs") renderBrowseLogs(val);
  else if (validScope === "timeline") renderBrowseTimeline(val);
  else if (validScope === "subtitles") renderBrowseSubs(val);
  else if (validScope === "sampledata") renderSampleList(val);

  updateCopyLinkButton();
  if (syncHash) syncUrlHash({ push: pushHistory });
}

/**
 * Switches the active Sample Data sub-scope (`all`, `field`, `cave`).
 * @param {string} scope - Target sample scope.
 * @param {object} [options]
 * @param {boolean} [options.resetFilter=true] - Clear search filter input.
 * @param {boolean} [options.syncHash=true] - Synchronize URL hash.
 * @param {boolean} [options.pushHistory=false] - Push a browser history entry.
 */
export function applySampleScope(scope, options = {}) {
  const validScope = VALID_SAMPLE_SCOPES.has(scope) ? scope : "all";
  const { resetFilter = true, syncHash = true, pushHistory = false } = options;
  state.sampleScope = validScope;
  setSampleScopeUi(validScope);
  const filterInput = document.getElementById("filter-input");
  if (filterInput && resetFilter) filterInput.value = "";
  renderSampleList(currentFilterValue());
  if (syncHash) syncUrlHash({ push: pushHistory });
}

/**
 * Loads all data dumps for a given commit SHA (or `"local"`) into Browse mode state.
 * Pre-computes timeline events, subtitle groupings, and sample lookup maps.
 * @param {string} sha - Commit SHA or `"local"`.
 * @param {function(string, boolean=): void} setStatus - Status banner updater.
 */
export async function loadBrowseVersion(sha, setStatus) {
  setStatus("Loading version…");
  state.currentBrowseSha = sha;
  try {
    const [logsJson, subsJson, sampleJson, sampleTextJson, timelineJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, sha),
      fetchFileAtSha(PATHS.subtitles, sha),
      fetchFileAtSha(PATHS.sampleData, sha),
      fetchFileAtSha(PATHS.sampleText, sha),
      fetchFileAtSha(PATHS.timelineData, sha),
    ]);
    const { logs } = normalizeLogs(logsJson);
    state.currentBrowseLogs = logs;
    state.currentBrowseSubs = normalizeArrayJson(subsJson);
    state.groupedBrowseSubs = groupSubtitles(state.currentBrowseSubs);
    state.timelineEvents = buildTimelineEvents(logs, normalizeArrayJson(timelineJson));
    state.sampleData = mergeSampleDataText(normalizeArrayJson(sampleJson), normalizeArrayJson(sampleTextJson));
    state.sampleDataById = new Map(state.sampleData.map((s) => [s.id, s]));

    state.selectedLogIdx = -1;
    state.selectedTimelineIdx = -1;
    state.selectedSubIdx = -1;
    state.selectedSampleIdx = -1;
    state.selectedLogKey = null;
    state.selectedTimelineKey = null;
    state.selectedSubKey = null;
    state.selectedSampleKey = null;

    const filter = currentFilterValue();
    if (state.browseScope === "logs") renderBrowseLogs(filter);
    else if (state.browseScope === "timeline") renderBrowseTimeline(filter);
    else if (state.browseScope === "subtitles") renderBrowseSubs(filter);
    else if (state.browseScope === "sampledata") renderSampleList(filter);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Unable to load version data: ${err.message}`, true);
  }
}

/**
 * Selects a Browse entry by stable key within `scope`, returning false and showing
 * an informative notice if the requested entry does not exist in the loaded version.
 * @param {string} scope - Active Browse scope.
 * @param {string} key - Stable entry identifier.
 * @returns {boolean} True if found and selected.
 */
export function selectBrowseEntryByKey(scope, key) {
  if (!key) return false;
  if (scope === "logs") {
    const found = state.filteredLogs.some((l) => l.id === key);
    if (found) {
      state.selectedLogKey = key;
      renderBrowseLogs(currentFilterValue());
      return true;
    }
    const pane = document.getElementById("detail-pane");
    if (pane) pane.innerHTML = `<p class="empty-note">Voyage log "${escapeHtml(key)}" was not found in this version.</p>`;
    return false;
  }
  if (scope === "timeline") {
    const found = state.filteredTimeline.some((ev) => ev.key === key);
    if (found) {
      state.selectedTimelineKey = key;
      renderBrowseTimeline(currentFilterValue());
      return true;
    }
    const pane = document.getElementById("detail-pane");
    if (pane) pane.innerHTML = `<p class="empty-note">Timeline event "${escapeHtml(key)}" was not found in this version.</p>`;
    return false;
  }
  if (scope === "subtitles") {
    const found = state.filteredSubGroups.some((g) => g.key === key);
    if (found) {
      state.selectedSubKey = key;
      renderBrowseSubs(currentFilterValue());
      return true;
    }
    const pane = document.getElementById("detail-pane");
    if (pane) pane.innerHTML = `<p class="empty-note">Quest subtitle group "${escapeHtml(key)}" was not found in this version.</p>`;
    return false;
  }
  const found = state.filteredSamples.some((s) => s.id === key);
  if (found) {
    state.selectedSampleKey = key;
    renderSampleList(currentFilterValue());
    return true;
  }
  const pane = document.getElementById("sampledata-detail-pane");
  if (pane) pane.innerHTML = `<p class="empty-note">Sample record "${escapeHtml(key)}" was not found in this version.</p>`;
  return false;
}
