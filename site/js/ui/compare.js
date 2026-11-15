import { escapeHtml, formatDuration } from "../core/formatters.js";
import { PATHS, fetchFileAtSha } from "../api/github.js";
import { normalizeLogs, normalizeArrayJson } from "../domain/logs.js";
import { compareSampleIds } from "../domain/sampledata.js";
import { diffByKey, renderWordDiff } from "../domain/diff.js";
import { state, COMPARE_SCOPE_TITLES } from "../state/store.js";
import { syncUrlHash } from "../state/router.js";

/**
 * Updates Compare mode content tab ARIA states, active panels, and header label.
 * @param {string} scope - One of `"logs"`, `"subtitles"`, `"sampledata"`.
 * @param {object} [options]
 * @param {boolean} [options.syncHash=false] - Synchronize URL hash.
 * @param {boolean} [options.pushHistory=false] - Push a browser history entry.
 */
export function applyCompareScope(scope, options = {}) {
  const validScope = COMPARE_SCOPE_TITLES[scope] ? scope : "logs";
  const { syncHash = false, pushHistory = false } = options;
  state.compareScope = validScope;
  document.querySelectorAll("#compare-content-tabs .content-tab").forEach((btn) => {
    const isActive = btn.dataset.content === validScope;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.getElementById("compare-logs")?.classList.toggle("active", validScope === "logs");
  document.getElementById("compare-subtitles")?.classList.toggle("active", validScope === "subtitles");
  document.getElementById("compare-sampledata")?.classList.toggle("active", validScope === "sampledata");
  const label = document.getElementById("compare-scope-label");
  if (label) label.textContent = COMPARE_SCOPE_TITLES[validScope];
  if (syncHash) syncUrlHash({ push: pushHistory });
}

function renderDiffSectionGroup(containerId, emptyMessage, added, changed, removed, cardRenderer) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((item) => cardRenderer("added", item)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((item) => cardRenderer("changed", item)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((item) => cardRenderer("removed", item)).join("");
  }
  container.innerHTML = html;
}

function renderFragmentDiff(fromLog, toLog) {
  const { added, removed, changed } = diffByKey(fromLog.fragments || [], toLog.fragments || [], (f) => f.id);
  if (!added.length && !removed.length && !changed.length) return "";
  const parts = [];
  for (const f of added) {
    parts.push(`<div class="fragment"><span class="diff-tag added">New fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div><p>${escapeHtml(f.description)}</p></div>`);
  }
  for (const f of removed) {
    parts.push(`<div class="fragment"><span class="diff-tag removed">Removed fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div></div>`);
  }
  for (const { from, to } of changed) {
    parts.push(`<div class="fragment"><span class="diff-tag changed">Changed fragment</span>
      <div class="fragment-title">${renderWordDiff(from.title, to.title)}</div>
      <p>${renderWordDiff(from.description, to.description)}</p>
    </div>`);
  }
  return parts.join("");
}

function renderLogDiffCard(kind, log) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(log.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(log.title)}</div>
      <p>${escapeHtml(log.description)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(log.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(log.title)}</div></div>`;
  }
  const titleChanged = log.from.title !== log.to.title;
  const descChanged = log.from.description !== log.to.description;
  const footerChanged = log.from.footer !== log.to.footer;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(log.to.id)}</span>
    <div class="fragment-title" style="margin-top:.4rem">${titleChanged ? renderWordDiff(log.from.title, log.to.title) : escapeHtml(log.to.title)}</div>
    ${descChanged ? `<p>${renderWordDiff(log.from.description, log.to.description)}</p>` : ""}
    ${footerChanged ? `<p class="footer-text">${renderWordDiff(log.from.footer, log.to.footer)}</p>` : ""}
    ${renderFragmentDiff(log.from, log.to)}
  </div>`;
}

/**
 * Renders diff sections comparing voyage logs between two versions.
 * @param {Array<object>} fromLogs - Base logs.
 * @param {Array<object>} toLogs - Target logs.
 */
export function renderLogsDiff(fromLogs, toLogs) {
  const { added, removed, changed } = diffByKey(fromLogs, toLogs, (l) => l.id);
  renderDiffSectionGroup(
    "compare-logs",
    "No differences detected. Voyage logs are identical between these two versions.",
    added,
    changed,
    removed,
    renderLogDiffCard
  );
}

function renderSubDiffCard(kind, item) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(item.Name)}</span> ${formatDuration(item.Duration)}
      <p>${escapeHtml(item.Subtitle)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(item.Name)}</span>
      <p>${escapeHtml(item.Subtitle)}</p></div>`;
  }
  const durationChanged = item.from.Duration !== item.to.Duration;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(item.to.Name)}</span>
    ${durationChanged ? `<span class="muted"> ${formatDuration(item.from.Duration)} → ${formatDuration(item.to.Duration)}</span>` : ""}
    <p>${renderWordDiff(item.from.Subtitle, item.to.Subtitle)}</p></div>`;
}

/**
 * Renders diff sections comparing quest subtitles between two versions.
 * @param {Array<object>} fromSubs - Base subtitles.
 * @param {Array<object>} toSubs - Target subtitles.
 */
export function renderSubsDiff(fromSubs, toSubs) {
  const { added, removed, changed } = diffByKey(fromSubs, toSubs, (s) => s.Name);
  renderDiffSectionGroup(
    "compare-subtitles",
    "No differences detected. Quest subtitles are identical between these two versions.",
    added,
    changed,
    removed,
    renderSubDiffCard
  );
}

function renderSampleTextDiffCard(kind, item) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(item.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(item.title)}</div>
      <p>${escapeHtml(item.sentDescription)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(item.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(item.title)}</div></div>`;
  }
  const titleChanged = item.from.title !== item.to.title;
  const uncollectedChanged = item.from.uncollectedDescription !== item.to.uncollectedDescription;
  const sentChanged = item.from.sentDescription !== item.to.sentDescription;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(item.to.id)}</span>
    <div class="fragment-title" style="margin-top:.4rem">${titleChanged ? renderWordDiff(item.from.title, item.to.title) : escapeHtml(item.to.title)}</div>
    ${uncollectedChanged ? `<p>${renderWordDiff(item.from.uncollectedDescription, item.to.uncollectedDescription)}</p>` : ""}
    ${sentChanged ? `<p>${renderWordDiff(item.from.sentDescription, item.to.sentDescription)}</p>` : ""}
  </div>`;
}

/**
 * Renders diff sections comparing sample data text between two versions, sorted numerically by ID.
 * @param {Array<object>} fromItems - Base sample text dump.
 * @param {Array<object>} toItems - Target sample text dump.
 */
export function renderSampleTextDiff(fromItems, toItems) {
  const { added, removed, changed } = diffByKey(fromItems, toItems, (s) => s.id);
  added.sort((a, b) => compareSampleIds(a.id, b.id));
  removed.sort((a, b) => compareSampleIds(a.id, b.id));
  changed.sort((a, b) => compareSampleIds(a.to.id, b.to.id));
  renderDiffSectionGroup(
    "compare-sampledata",
    "No differences detected. Sample data records are identical between these two versions.",
    added,
    changed,
    removed,
    renderSampleTextDiffCard
  );
}

/**
 * Fetches both selected Compare versions and renders diffs across logs, subtitles, and sample data,
 * displaying explicit loading and error states inside the compare panes.
 * @param {function(string, boolean=): void} setStatus - Status banner updater.
 */
export async function loadCompare(setStatus) {
  const fromSha = document.getElementById("compare-from")?.value;
  const toSha = document.getElementById("compare-to")?.value;
  if (!fromSha || !toSha) return;

  const logsEl = document.getElementById("compare-logs");
  const subsEl = document.getElementById("compare-subtitles");
  const sampleEl = document.getElementById("compare-sampledata");
  if (logsEl) logsEl.innerHTML = `<p class="empty-note">Loading diff…</p>`;
  if (subsEl) subsEl.innerHTML = `<p class="empty-note">Loading diff…</p>`;
  if (sampleEl) sampleEl.innerHTML = `<p class="empty-note">Loading diff…</p>`;

  setStatus("Comparing versions…");
  try {
    const [fromLogsJson, toLogsJson, fromSubsJson, toSubsJson, fromSampleJson, toSampleJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, fromSha),
      fetchFileAtSha(PATHS.logs, toSha),
      fetchFileAtSha(PATHS.subtitles, fromSha),
      fetchFileAtSha(PATHS.subtitles, toSha),
      fetchFileAtSha(PATHS.sampleText, fromSha),
      fetchFileAtSha(PATHS.sampleText, toSha),
    ]);
    renderLogsDiff(normalizeLogs(fromLogsJson).logs, normalizeLogs(toLogsJson).logs);
    renderSubsDiff(normalizeArrayJson(fromSubsJson), normalizeArrayJson(toSubsJson));
    renderSampleTextDiff(normalizeArrayJson(fromSampleJson), normalizeArrayJson(toSampleJson));
    setStatus("");
  } catch (err) {
    console.error(err);
    if (logsEl) logsEl.innerHTML = `<p class="empty-note">Unable to compare voyage logs: ${escapeHtml(err.message)}</p>`;
    if (subsEl) subsEl.innerHTML = `<p class="empty-note">Unable to compare quest subtitles: ${escapeHtml(err.message)}</p>`;
    if (sampleEl) sampleEl.innerHTML = `<p class="empty-note">Unable to compare sample data: ${escapeHtml(err.message)}</p>`;
    setStatus(`Comparison failed: ${err.message}`, true);
  }
}
