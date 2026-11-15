import { clearCopiedSelection } from "../core/clipboard.js";
import { stepIndex } from "../core/formatters.js";
import { state } from "../state/store.js";
import {
  currentFilterValue,
  renderBrowseLogs,
  renderBrowseTimeline,
  renderBrowseSubs,
  renderSampleList,
  scrollSelectedEntryIntoView,
  hideSelectionLinkButton,
  unlockSample,
} from "./browse.js";
import { loadCompare } from "./compare.js";

/**
 * Steps the active Browse list selection forward or backward by `delta`, wrapping around.
 * @param {number} delta - Step offset (`-1` or `+1`).
 */
export function moveSelection(delta) {
  if (state.currentMode !== "browse") return;
  const filterVal = currentFilterValue();
  if (state.browseScope === "logs") {
    if (!state.filteredLogs.length) return;
    state.selectedLogIdx = stepIndex(state.selectedLogIdx, state.filteredLogs.length, delta);
    state.selectedLogKey = state.filteredLogs[state.selectedLogIdx]?.id || null;
    renderBrowseLogs(filterVal);
  } else if (state.browseScope === "timeline") {
    if (!state.filteredTimeline.length) return;
    state.selectedTimelineIdx = stepIndex(state.selectedTimelineIdx, state.filteredTimeline.length, delta);
    state.selectedTimelineKey = state.filteredTimeline[state.selectedTimelineIdx]?.key || null;
    renderBrowseTimeline(filterVal);
  } else if (state.browseScope === "subtitles") {
    if (!state.filteredSubGroups.length) return;
    state.selectedSubIdx = stepIndex(state.selectedSubIdx, state.filteredSubGroups.length, delta);
    state.selectedSubKey = state.filteredSubGroups[state.selectedSubIdx]?.key || null;
    renderBrowseSubs(filterVal);
  } else {
    if (!state.filteredSamples.length) return;
    state.selectedSampleIdx = stepIndex(state.selectedSampleIdx, state.filteredSamples.length, delta);
    state.selectedSampleKey = state.filteredSamples[state.selectedSampleIdx]?.id || null;
    renderSampleList(filterVal);
  }
  scrollSelectedEntryIntoView();
}

/**
 * Steps the Compare target version dropdown (`#compare-to`) by `delta`.
 * @param {number} delta - Option index delta (`+1` older, `-1` newer).
 */
export function stepVersion(delta) {
  const select = document.getElementById("compare-to");
  if (!select) return;
  const nextIndex = select.selectedIndex + delta;
  if (nextIndex < 0 || nextIndex >= select.options.length) return;
  select.selectedIndex = nextIndex;
  select.dispatchEvent(new Event("change"));
}

/**
 * Smoothly scrolls the Browse detail pane vertically by `delta` pixels.
 * @param {number} delta - Vertical scroll offset in pixels.
 */
export function scrollBrowseDetail(delta) {
  document.querySelector("#panel-browse .detail-screen .screen-scroll")?.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Applies the current CRT brightness, contrast, saturation, and power state to all `.screens`.
 */
export function applyDisplayFilter() {
  document.querySelectorAll(".screens").forEach((el) => {
    el.style.filter = state.displayOn
      ? `brightness(${state.brt}%) contrast(${state.con}%) saturate(${state.sat}%)`
      : "brightness(0%)";
  });
}

/**
 * Wires event handlers for the physical-style CRT hardware control strip buttons.
 * @param {function(string, boolean=): void} setStatus - Status banner updater.
 */
export function wireDeviceControls(setStatus) {
  // In Browse mode, UP/DOWN scroll the detail pane and PREV/NEXT step between
  // entries in the list -- Compare mode has no entry list, so there PREV/NEXT
  // fall back to stepping the "to" version instead.
  document.getElementById("btn-up")?.addEventListener("click", () => {
    if (state.currentMode === "browse") scrollBrowseDetail(-120);
  });
  document.getElementById("btn-down")?.addEventListener("click", () => {
    if (state.currentMode === "browse") scrollBrowseDetail(120);
  });
  document.getElementById("btn-prev")?.addEventListener("click", () => {
    if (state.currentMode === "browse") moveSelection(-1);
    else stepVersion(1); // older
  });
  document.getElementById("btn-next")?.addEventListener("click", () => {
    if (state.currentMode === "browse") moveSelection(1);
    else stepVersion(-1); // newer
  });
  document.getElementById("btn-exe")?.addEventListener("click", () => {
    if (state.currentMode === "compare") {
      loadCompare(setStatus);
    } else if (state.browseScope === "sampledata") {
      const it = state.filteredSamples[state.selectedSampleIdx];
      if (it) unlockSample(it.id);
    } else {
      document.getElementById("filter-input")?.focus();
    }
  });
  document.getElementById("btn-exit")?.addEventListener("click", () => {
    const input = document.getElementById("filter-input");
    if (input) {
      input.value = "";
      input.blur();
    }
    clearCopiedSelection();
    hideSelectionLinkButton();
    if (state.currentMode !== "browse") return;
    if (state.browseScope === "logs") renderBrowseLogs("");
    else if (state.browseScope === "timeline") renderBrowseTimeline("");
    else if (state.browseScope === "subtitles") renderBrowseSubs("");
    else renderSampleList("");
  });

  const led = document.getElementById("status-led");
  const dispBtn = document.getElementById("disp-toggle");

  dispBtn?.addEventListener("click", () => {
    state.displayOn = !state.displayOn;
    dispBtn.textContent = state.displayOn ? "DISP ON" : "DISP OFF";
    dispBtn.setAttribute("aria-pressed", state.displayOn ? "true" : "false");
    led?.classList.toggle("off", !state.displayOn);
    applyDisplayFilter();
  });

  document.querySelectorAll(".control-grid [data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const clampFilter = (v) => Math.max(40, Math.min(160, v));
      if (action === "brt-up") state.brt = clampFilter(state.brt + 10);
      if (action === "brt-down") state.brt = clampFilter(state.brt - 10);
      if (action === "con-up") state.con = clampFilter(state.con + 10);
      if (action === "con-down") state.con = clampFilter(state.con - 10);
      if (action === "sat-up") state.sat = clampFilter(state.sat + 10);
      if (action === "sat-down") state.sat = clampFilter(state.sat - 10);
      applyDisplayFilter();
    });
  });
}
