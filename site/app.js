"use strict";

// GitHub Pages project sites are always served as https://<owner>.github.io/<repo>/,
// so the repo this site should read from can be read straight off the URL instead of
// hardcoded -- the same app.js works unmodified on any fork's Pages deployment. Falls
// back to this repo for local testing (file://, localhost) where that pattern doesn't apply.
function detectRepo() {
  const override = new URLSearchParams(location.search).get("repo");
  if (override) return override;
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const repoName = m && location.pathname.split("/").filter(Boolean)[0];
  return m && repoName ? `${m[1]}/${repoName}` : null;
}

const REPO = detectRepo();
const PATHS = {
  logs: "voyage_logs_dump.json",
  subtitles: "voyage_quest_subtitles_dump.json",
  sampleText: "voyage_sampledata_text_dump.json",
  sampleData: "site/sampledata/data.json",
  sampleImagesDir: "sampledata_images",
};

const fileCache = new Map(); // `${sha}:${path}` -> parsed json | null (missing)

let versions = []; // [{ sha, message, date }], newest first
let currentBrowseSha = null; // sha of the version currently loaded in Browse mode
let currentBrowseLogs = [];
let currentBrowseSubs = [];
let filteredLogs = [];
let filteredSubGroups = [];

let currentMode = "browse"; // "browse" | "compare"
let browseScope = "logs"; // "logs" | "subtitles" | "sampledata"
let compareScope = "logs"; // "logs" | "subtitles" | "sampledata"
let selectedLogIdx = -1;
let selectedSubIdx = -1; // indexes filteredSubGroups

let sampleData = []; // reloaded per-version by loadBrowseVersion(), like currentBrowseLogs/Subs
let filteredSamples = [];
let sampleScope = "all"; // "all" | "field" | "cave"
let selectedSampleIdx = -1;
const unlockedSamples = new Set();

let displayOn = true;
let brt = 100, con = 100, sat = 100;

// ---------- helpers ----------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDuration(d) {
  return typeof d === "number" ? `${d.toFixed(1)}s` : "";
}

function formatDate(iso) {
  return iso ? iso.slice(0, 10) : "";
}

function firstLine(msg) {
  const line = (msg || "").split("\n")[0];
  return line.length > 70 ? line.slice(0, 67) + "…" : line;
}

function setStatus(text, isError) {
  const el = document.getElementById("status");
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", !!isError);
}

function decodeArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.slice(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.slice(2));
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf.slice(3));
  }
  return new TextDecoder("utf-8").decode(buf);
}

async function fetchFileAtSha(path, sha) {
  const key = `${sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);
  const url = `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`;
  const res = await fetch(url);
  if (res.status === 404) {
    fileCache.set(key, null);
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path} @ ${sha.slice(0, 7)} (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  const json = JSON.parse(decodeArrayBuffer(buf));
  fileCache.set(key, json);
  return json;
}

function normalizeLogs(json) {
  if (!json) return { buildNumber: null, logs: [] };
  if (Array.isArray(json)) return { buildNumber: null, logs: json };
  return { buildNumber: json.build_number || null, logs: json.data || [] };
}

function normalizeArrayJson(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data || [];
}

// Subtitle names encode "<storyline>-<part>", e.g. "CU3_3-1" .. "CU3_3-6" are six
// lines of the same storyline (CU3 = Concurrent Update 3, "3" = story index).
// Part suffixes aren't always plain integers (e.g. "-1a", "-2_Anna_B"), so only the
// leading digits are used for ordering within a group.
const SUBTITLE_PART_RE = /^(.*)-(\d.*)$/;

function subtitleGroupKey(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[1] : (name || "");
}

function subtitlePartLabel(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[2] : "";
}

function subtitlePartNumber(name) {
  const n = parseInt(subtitlePartLabel(name), 10);
  return Number.isNaN(n) ? 0 : n;
}

function groupSubtitles(subs) {
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
  return order.map((key) => {
    const items = byKey.get(key).slice().sort((a, b) => subtitlePartNumber(a.Name) - subtitlePartNumber(b.Name));
    const totalDuration = items.reduce((sum, s) => sum + (s.Duration || 0), 0);
    return { key, items, totalDuration };
  });
}

// ---------- commit history ----------

async function fetchCommitsForPath(path) {
  const commits = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=100&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to list commits for ${path} (${res.status})`);
    const data = await res.json();
    for (const c of data) {
      commits.push({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.author?.date || c.commit.committer?.date,
      });
    }
    if (data.length < 100) break;
  }
  return commits;
}

async function buildVersionList() {
  const [logCommits, subCommits, sampleTextCommits, sampleDataCommits] = await Promise.all([
    fetchCommitsForPath(PATHS.logs),
    fetchCommitsForPath(PATHS.subtitles),
    fetchCommitsForPath(PATHS.sampleText),
    fetchCommitsForPath(PATHS.sampleData),
  ]);
  const bySha = new Map();
  for (const c of [...logCommits, ...subCommits, ...sampleTextCommits, ...sampleDataCommits]) {
    if (!bySha.has(c.sha)) bySha.set(c.sha, c);
  }
  return [...bySha.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function populateVersionSelects() {
  const optionsHtml = versions
    .map((v) => `<option value="${v.sha}">${escapeHtml(formatDate(v.date))} · ${escapeHtml(firstLine(v.message))} (${v.sha.slice(0, 7)})</option>`)
    .join("");
  for (const id of ["browse-version", "compare-from", "compare-to"]) {
    document.getElementById(id).innerHTML = optionsHtml;
  }
  document.getElementById("browse-version").value = versions[0].sha;
  document.getElementById("compare-to").value = versions[0].sha;
  document.getElementById("compare-from").value = (versions[1] || versions[0]).sha;
}

// ---------- browse: master list rendering ----------

function entryRowHtml(idx, title, badge, isSelected) {
  return `<div class="entry ${isSelected ? "selected" : ""}" data-idx="${idx}">
    <span class="entry-title">${escapeHtml(title) || "<em>(untitled)</em>"}</span>
    <span class="entry-badge">${escapeHtml(badge)}</span>
  </div>`;
}

function renderBrowseLogs(filterText) {
  const term = (filterText || "").toLowerCase();
  filteredLogs = currentBrowseLogs.filter(
    (l) => !term || (l.title || "").toLowerCase().includes(term) || (l.id || "").toLowerCase().includes(term)
  );
  if (selectedLogIdx >= filteredLogs.length) selectedLogIdx = filteredLogs.length ? 0 : -1;
  if (selectedLogIdx === -1 && filteredLogs.length) selectedLogIdx = 0;

  const container = document.getElementById("logs-list");
  container.innerHTML = filteredLogs.length
    ? filteredLogs
        .map((l, i) => {
          const count = (l.fragments || []).length;
          return entryRowHtml(i, l.title, `${count} ${count === 1 ? "PAGE" : "PAGES"}`, i === selectedLogIdx);
        })
        .join("")
    : `<p class="empty-note">No logs match your filter.</p>`;

  if (browseScope === "logs") {
    document.getElementById("list-count").textContent = `${filteredLogs.length}/${currentBrowseLogs.length}`;
    renderDetail();
  }
}

function renderBrowseSubs(filterText) {
  const term = (filterText || "").toLowerCase();
  const groups = groupSubtitles(currentBrowseSubs);
  filteredSubGroups = !term
    ? groups
    : groups.filter(
        (g) =>
          g.key.toLowerCase().includes(term) ||
          g.items.some((s) => (s.Name || "").toLowerCase().includes(term) || (s.Subtitle || "").toLowerCase().includes(term))
      );
  if (selectedSubIdx >= filteredSubGroups.length) selectedSubIdx = filteredSubGroups.length ? 0 : -1;
  if (selectedSubIdx === -1 && filteredSubGroups.length) selectedSubIdx = 0;

  const container = document.getElementById("subs-list");
  container.innerHTML = filteredSubGroups.length
    ? filteredSubGroups
        .map((g, i) => {
          const count = g.items.length;
          return entryRowHtml(i, g.key, `${count} ${count === 1 ? "LINE" : "LINES"}`, i === selectedSubIdx);
        })
        .join("")
    : `<p class="empty-note">No subtitles match your filter.</p>`;

  if (browseScope === "subtitles") {
    document.getElementById("list-count").textContent = `${filteredSubGroups.length}/${groups.length}`;
    renderDetail();
  }
}

// ---------- browse: detail pane rendering ----------

function renderLogDetail() {
  const pane = document.getElementById("detail-pane");
  const log = filteredLogs[selectedLogIdx];
  if (!log) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const fragments = (log.fragments || [])
    .map(
      (f) => `<div class="fragment">
        <div class="fragment-title">${escapeHtml(f.title)}</div>
        <p>${escapeHtml(f.description)}</p>
      </div>`
    )
    .join("");
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(log.title) || "(untitled)"} ${selectedLogIdx + 1}/${filteredLogs.length}</div>
    <div class="detail-head-2">${escapeHtml(log.id)}</div>
    ${log.description ? `<p class="detail-intro">${escapeHtml(log.description)}</p>` : ""}
    ${fragments}
    ${log.footer ? `<p class="footer-text">${escapeHtml(log.footer)}</p>` : ""}
  `;
}

function renderSubDetail() {
  const pane = document.getElementById("detail-pane");
  const group = filteredSubGroups[selectedSubIdx];
  if (!group) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const lines = group.items
    .map(
      (s) => `<div class="fragment">
        <div class="fragment-title">Part ${escapeHtml(subtitlePartLabel(s.Name)) || "?"} <span class="muted">${formatDuration(s.Duration)}</span></div>
        <p>${escapeHtml(s.Subtitle)}</p>
      </div>`
    )
    .join("");
  const count = group.items.length;
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(group.key)} ${selectedSubIdx + 1}/${filteredSubGroups.length}</div>
    <div class="detail-head-2">${count} ${count === 1 ? "line" : "lines"} · ${formatDuration(group.totalDuration)}</div>
    ${lines}
  `;
}

function renderDetail() {
  if (browseScope === "logs") renderLogDetail();
  else if (browseScope === "subtitles") renderSubDetail();
}

// The curated site/sampledata/data.json is a hand-maintained snapshot and can drift
// out of sync with the game's real unlock text (or lack an entry's unlock text
// entirely). voyage_sampledata_text_dump.json is dumped straight from the game at
// each version, so its sentDescription is the source of truth for `unlock` -- it's
// merged in here rather than trusted from the curated file.
function mergeSampleDataText(samples, textDump) {
  const byId = new Map();
  for (const t of textDump) byId.set(t.id, t);
  return samples.map((s) => {
    const t = byId.get(`DA_SampleData_${s.id}`);
    return t && t.sentDescription ? { ...s, unlock: t.sentDescription } : s;
  });
}

async function loadBrowseVersion(sha) {
  setStatus("Loading version…");
  currentBrowseSha = sha;
  try {
    const [logsJson, subsJson, sampleJson, sampleTextJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, sha),
      fetchFileAtSha(PATHS.subtitles, sha),
      fetchFileAtSha(PATHS.sampleData, sha),
      fetchFileAtSha(PATHS.sampleText, sha),
    ]);
    const { logs } = normalizeLogs(logsJson);
    currentBrowseLogs = logs;
    currentBrowseSubs = normalizeArrayJson(subsJson);
    sampleData = mergeSampleDataText(normalizeArrayJson(sampleJson), normalizeArrayJson(sampleTextJson));
    selectedLogIdx = -1;
    selectedSubIdx = -1;
    selectedSampleIdx = -1;

    renderBrowseLogs(document.getElementById("filter-input").value);
    renderBrowseSubs(document.getElementById("filter-input").value);
    renderSampleList(document.getElementById("filter-input").value);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
}

// ---------- sample data ----------

function sampleCode(it) {
  return it.collection === "cave"
    ? `CAVE-${String(it.id.replace("CavePainting_", "")).padStart(3, "0")}`
    : `SD-${String(it.id).padStart(3, "0")}`;
}

function sampleSiteLabel(it) {
  return it.collection === "cave" ? "Orbit archive" : it.site || "—";
}

// Thumbnails live at the repo root (sampledata_images/SampleData_<id>.png), same as
// the *_dump.json files -- raw.githubusercontent.com works directly as an <img> src,
// no fetch/decode needed, and it's naturally version-aware like the JSON dumps (not
// every id has art, e.g. "Bed on Wheels" -- a 404 there is expected, not a bug).
function sampleImageUrl(it) {
  if (!currentBrowseSha) return null;
  return `https://raw.githubusercontent.com/${REPO}/${currentBrowseSha}/${PATHS.sampleImagesDir}/SampleData_${it.id}.png`;
}

function renderSampleList(filterText) {
  const term = (filterText || "").toLowerCase();
  filteredSamples = sampleData.filter((it) => {
    const matchesScope = sampleScope === "all" || it.collection === sampleScope;
    const hay = `${it.title} ${it.short} ${it.site || ""}`.toLowerCase();
    const matchesTerm = !term || hay.includes(term);
    return matchesScope && matchesTerm;
  });
  if (selectedSampleIdx >= filteredSamples.length) selectedSampleIdx = filteredSamples.length ? 0 : -1;
  if (selectedSampleIdx === -1 && filteredSamples.length) selectedSampleIdx = 0;

  const container = document.getElementById("sampledata-list");
  container.innerHTML = filteredSamples.length
    ? filteredSamples
        .map((it, i) => entryRowHtml(i, it.title, sampleCode(it), i === selectedSampleIdx))
        .join("")
    : `<p class="empty-note">No sample data matches your filter.</p>`;

  if (browseScope === "sampledata") {
    document.getElementById("list-count").textContent = `${filteredSamples.length}/${sampleData.length}`;
    renderSampleDetail();
  }
}

function renderSampleDetail() {
  const pane = document.getElementById("sampledata-detail-pane");
  const it = filteredSamples[selectedSampleIdx];
  if (!it) {
    pane.innerHTML = `<p class="empty-note">Select a record from the list.</p>`;
    return;
  }

  // Not every id has a recovered texture (e.g. "Bed on Wheels") -- rather than
  // tracking that in data.json, just attempt the image and fall back on error.
  const imgUrl = sampleImageUrl(it);
  const media = `
    <div class="framebuffer" id="sample-framebuffer">
      <img id="sample-image" src="${imgUrl}" alt="${escapeHtml(it.title)}" loading="lazy">
      <div class="framebuffer-cap">FRAMEBUFFER // ${sampleCode(it)}.CAP</div>
    </div>
    <div class="fb-missing hidden" id="sample-image-missing">[ NO CAPTURE ON RECORD ]<br>scan exists in log only — image was never recovered</div>
  `;

  const isUnlocked = unlockedSamples.has(it.id);
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
    <div class="detail-head-1">${escapeHtml(it.title)} ${selectedSampleIdx + 1}/${filteredSamples.length}</div>
    <div class="detail-head-2">${sampleCode(it)} · ${escapeHtml(sampleSiteLabel(it))}</div>
    ${media}
    <div class="section-label">Field reading</div>
    <p>${escapeHtml(it.short)}</p>
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

function unlockSample(id) {
  const it = sampleData.find((s) => s.id === id);
  if (!it || !it.unlock) return;
  unlockedSamples.add(id);
  renderSampleDetail();
}

// ---------- diffing ----------

function renderWordDiff(oldText, newText) {
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

function diffByKey(fromList, toList, keyFn) {
  const fromMap = new Map(fromList.map((x) => [keyFn(x), x]));
  const toMap = new Map(toList.map((x) => [keyFn(x), x]));
  const added = [...toMap.keys()].filter((k) => !fromMap.has(k)).map((k) => toMap.get(k));
  const removed = [...fromMap.keys()].filter((k) => !toMap.has(k)).map((k) => fromMap.get(k));
  const changed = [];
  for (const k of toMap.keys()) {
    if (!fromMap.has(k)) continue;
    const a = fromMap.get(k);
    const b = toMap.get(k);
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push({ key: k, from: a, to: b });
  }
  return { added, removed, changed };
}

function renderFragmentDiff(fromLog, toLog) {
  const { added, removed, changed } = diffByKey(fromLog.fragments || [], toLog.fragments || [], (f) => f.id);
  if (!added.length && !removed.length && !changed.length) return "";
  const parts = [];
  for (const f of added) parts.push(`<div class="fragment"><span class="diff-tag added">New fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div><p>${escapeHtml(f.description)}</p></div>`);
  for (const f of removed) parts.push(`<div class="fragment"><span class="diff-tag removed">Removed fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div></div>`);
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
  // changed
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

function renderLogsDiff(fromLogs, toLogs) {
  const { added, removed, changed } = diffByKey(fromLogs, toLogs, (l) => l.id);
  const container = document.getElementById("compare-logs");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in voyage logs between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((l) => renderLogDiffCard("added", l)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderLogDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((l) => renderLogDiffCard("removed", l)).join("");
  }
  container.innerHTML = html;
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

function renderSubsDiff(fromSubs, toSubs) {
  const { added, removed, changed } = diffByKey(fromSubs, toSubs, (s) => s.Name);
  const container = document.getElementById("compare-subtitles");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in quest subtitles between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((s) => renderSubDiffCard("added", s)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderSubDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((s) => renderSubDiffCard("removed", s)).join("");
  }
  container.innerHTML = html;
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

// Sample data ids come from FindAllOf()'s arbitrary traversal order (unlike logs/
// subtitles, which are already author-ordered), e.g. "DA_SampleData_131" right
// before "DA_SampleData_104" -- so sort numerically for a stable, readable diff.
function sampleIdSortKey(id) {
  const m = /^DA_SampleData_(?:(CavePainting)_)?(\d+)$/.exec(id || "");
  return m ? [m[1] ? 1 : 0, parseInt(m[2], 10)] : [2, 0];
}

function compareSampleIds(a, b) {
  const ka = sampleIdSortKey(a);
  const kb = sampleIdSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

function renderSampleTextDiff(fromItems, toItems) {
  const { added, removed, changed } = diffByKey(fromItems, toItems, (s) => s.id);
  added.sort((a, b) => compareSampleIds(a.id, b.id));
  removed.sort((a, b) => compareSampleIds(a.id, b.id));
  changed.sort((a, b) => compareSampleIds(a.to.id, b.to.id));
  const container = document.getElementById("compare-sampledata");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in sample data text between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((s) => renderSampleTextDiffCard("added", s)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderSampleTextDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((s) => renderSampleTextDiffCard("removed", s)).join("");
  }
  container.innerHTML = html;
}

async function loadCompare() {
  const fromSha = document.getElementById("compare-from").value;
  const toSha = document.getElementById("compare-to").value;
  if (!fromSha || !toSha) return;
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
    setStatus(err.message, true);
  }
}

// ---------- toolbar wiring ----------

function wireModeTabs() {
  const tabs = document.querySelectorAll("#mode-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll("#mode-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  document.getElementById("panel-browse").classList.toggle("active", currentMode === "browse");
  document.getElementById("panel-compare").classList.toggle("active", currentMode === "compare");
  document.getElementById("browse-controls").classList.toggle("hidden", currentMode !== "browse");
  document.getElementById("compare-controls").classList.toggle("hidden", currentMode !== "compare");
  const filterInput = document.getElementById("filter-input");
  const terminalBar = document.getElementById("terminal-bar");
  if (currentMode === "compare") {
    terminalBar.classList.add("disabled");
    filterInput.placeholder = "filtering not available in compare mode";
  } else {
    terminalBar.classList.remove("disabled");
    filterInput.placeholder = browseScope === "sampledata" ? "type to filter sample data…" : "type to filter…";
  }
  if (currentMode === "compare") loadCompare();
}

const SCOPE_TITLES = { logs: "DATA LOGS", subtitles: "QUEST SUBTITLES", sampledata: "SAMPLE DATA" };
const COMPARE_SCOPE_TITLES = { logs: "VOYAGE LOGS", subtitles: "QUEST SUBTITLES", sampledata: "SAMPLE DATA" };

function wireBrowseContentTabs() {
  const buttons = document.querySelectorAll("#browse-content-tabs .content-tab");
  const title = document.getElementById("list-screen-title");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      browseScope = btn.dataset.content;

      document.getElementById("logs-list").classList.toggle("hidden", browseScope !== "logs");
      document.getElementById("subs-list").classList.toggle("hidden", browseScope !== "subtitles");
      document.getElementById("sampledata-list").classList.toggle("hidden", browseScope !== "sampledata");
      document.getElementById("detail-pane").classList.toggle("hidden", browseScope === "sampledata");
      document.getElementById("sampledata-detail-pane").classList.toggle("hidden", browseScope !== "sampledata");
      document.getElementById("sampledata-content-tabs").classList.toggle("hidden", browseScope !== "sampledata");
      title.textContent = SCOPE_TITLES[browseScope];

      const filterInput = document.getElementById("filter-input");
      filterInput.value = "";
      filterInput.placeholder = browseScope === "sampledata" ? "type to filter sample data…" : "type to filter…";

      renderBrowseLogs("");
      renderBrowseSubs("");
      renderSampleList("");
    });
  });
}

function wireCompareContentTabs() {
  const buttons = document.querySelectorAll("#compare-content-tabs .content-tab");
  const label = document.getElementById("compare-scope-label");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      compareScope = btn.dataset.content;
      document.getElementById("compare-logs").classList.toggle("active", compareScope === "logs");
      document.getElementById("compare-subtitles").classList.toggle("active", compareScope === "subtitles");
      document.getElementById("compare-sampledata").classList.toggle("active", compareScope === "sampledata");
      label.textContent = COMPARE_SCOPE_TITLES[compareScope];
    });
  });
}

function wireSampleContentTabs() {
  const buttons = document.querySelectorAll("#sampledata-content-tabs .content-tab");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      sampleScope = btn.dataset.content;
      document.getElementById("filter-input").value = "";
      renderSampleList("");
    });
  });
}

function wireEntryListClicks() {
  document.getElementById("logs-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedLogIdx = Number(row.dataset.idx);
    renderBrowseLogs(document.getElementById("filter-input").value);
  });
  document.getElementById("subs-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedSubIdx = Number(row.dataset.idx);
    renderBrowseSubs(document.getElementById("filter-input").value);
  });
  document.getElementById("sampledata-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedSampleIdx = Number(row.dataset.idx);
    renderSampleList(document.getElementById("filter-input").value);
  });
}

function wireFilterInput() {
  document.getElementById("filter-input").addEventListener("input", (e) => {
    if (currentMode !== "browse") return;
    if (browseScope === "logs") renderBrowseLogs(e.target.value);
    else if (browseScope === "subtitles") renderBrowseSubs(e.target.value);
    else renderSampleList(e.target.value);
  });
}

// ---------- device controls ----------

function moveSelection(delta) {
  if (currentMode !== "browse") return;
  if (browseScope === "logs") {
    if (!filteredLogs.length) return;
    selectedLogIdx = (selectedLogIdx + delta + filteredLogs.length) % filteredLogs.length;
    renderBrowseLogs(document.getElementById("filter-input").value);
    document.querySelector("#logs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  } else if (browseScope === "subtitles") {
    if (!filteredSubGroups.length) return;
    selectedSubIdx = (selectedSubIdx + delta + filteredSubGroups.length) % filteredSubGroups.length;
    renderBrowseSubs(document.getElementById("filter-input").value);
    document.querySelector("#subs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  } else {
    if (!filteredSamples.length) return;
    selectedSampleIdx = (selectedSampleIdx + delta + filteredSamples.length) % filteredSamples.length;
    renderSampleList(document.getElementById("filter-input").value);
    document.querySelector("#sampledata-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  }
}

// Compare mode has no browsable entry list (just diff cards), so PREV/NEXT there
// still step through the "to" version instead.
function stepVersion(delta) {
  const select = document.getElementById("compare-to");
  const nextIndex = select.selectedIndex + delta;
  if (nextIndex < 0 || nextIndex >= select.options.length) return;
  select.selectedIndex = nextIndex;
  select.dispatchEvent(new Event("change"));
}

function scrollBrowseDetail(delta) {
  document.querySelector("#panel-browse .detail-screen .screen-scroll")?.scrollBy({ top: delta, behavior: "smooth" });
}

function wireDeviceControls() {
  // In Browse mode, UP/DOWN scroll the detail pane and PREV/NEXT step between
  // entries in the list -- Compare mode has no entry list, so there PREV/NEXT
  // fall back to stepping the "to" version instead.
  document.getElementById("btn-up").addEventListener("click", () => {
    if (currentMode === "browse") scrollBrowseDetail(-120);
  });
  document.getElementById("btn-down").addEventListener("click", () => {
    if (currentMode === "browse") scrollBrowseDetail(120);
  });
  document.getElementById("btn-prev").addEventListener("click", () => {
    if (currentMode === "browse") moveSelection(-1);
    else stepVersion(1); // older
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    if (currentMode === "browse") moveSelection(1);
    else stepVersion(-1); // newer
  });
  document.getElementById("btn-exe").addEventListener("click", () => {
    if (currentMode === "compare") {
      loadCompare();
    } else if (browseScope === "sampledata") {
      const it = filteredSamples[selectedSampleIdx];
      if (it) unlockSample(it.id);
    } else {
      document.getElementById("filter-input").focus();
    }
  });
  document.getElementById("btn-exit").addEventListener("click", () => {
    const input = document.getElementById("filter-input");
    input.value = "";
    input.blur();
    if (currentMode !== "browse") return;
    if (browseScope === "logs") renderBrowseLogs("");
    else if (browseScope === "subtitles") renderBrowseSubs("");
    else renderSampleList("");
  });

  const led = document.getElementById("status-led");
  const dispBtn = document.getElementById("disp-toggle");
  const screensEls = () => document.querySelectorAll(".screens");

  function applyDisplayFilter() {
    screensEls().forEach((el) => {
      el.style.filter = displayOn ? `brightness(${brt}%) contrast(${con}%) saturate(${sat}%)` : "brightness(0%)";
    });
  }

  dispBtn.addEventListener("click", () => {
    displayOn = !displayOn;
    dispBtn.textContent = displayOn ? "DISP ON" : "DISP OFF";
    led.classList.toggle("off", !displayOn);
    applyDisplayFilter();
  });

  document.querySelectorAll(".control-grid [data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const clamp = (v) => Math.max(40, Math.min(160, v));
      if (action === "brt-up") brt = clamp(brt + 10);
      if (action === "brt-down") brt = clamp(brt - 10);
      if (action === "con-up") con = clamp(con + 10);
      if (action === "con-down") con = clamp(con - 10);
      if (action === "sat-up") sat = clamp(sat + 10);
      if (action === "sat-down") sat = clamp(sat - 10);
      applyDisplayFilter();
    });
  });
}

// ---------- bootstrap ----------

async function init() {
  if (!REPO) {
    setStatus("Could not determine which repo to load from this URL -- pass ?repo=owner/name (e.g. for local testing).", true);
    return;
  }

  wireModeTabs();
  wireBrowseContentTabs();
  wireCompareContentTabs();
  wireSampleContentTabs();
  wireEntryListClicks();
  wireFilterInput();
  wireDeviceControls();

  setStatus("Loading commit history…");
  try {
    versions = await buildVersionList();
    if (!versions.length) throw new Error("No commit history found for these files.");
    populateVersionSelects();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
    return;
  }

  document.getElementById("browse-version").addEventListener("change", (e) => loadBrowseVersion(e.target.value));
  document.getElementById("compare-from").addEventListener("change", loadCompare);
  document.getElementById("compare-to").addEventListener("change", loadCompare);

  await loadBrowseVersion(document.getElementById("browse-version").value);
}

document.addEventListener("DOMContentLoaded", init);
