export const SCOPE_TITLES = {
  logs: "DATA LOGS",
  timeline: "TIMELINE",
  subtitles: "QUEST SUBTITLES",
  sampledata: "SAMPLE DATA",
};

export const COMPARE_SCOPE_TITLES = {
  logs: "VOYAGE LOGS",
  subtitles: "QUEST SUBTITLES",
  sampledata: "SAMPLE DATA",
};

export const state = {
  versions: [], // [{ sha, message, date }], newest first
  currentBrowseSha: null, // sha of the version currently loaded in Browse mode
  currentBrowseLogs: [],
  currentBrowseSubs: [],
  groupedBrowseSubs: [], // cached subtitle groups for currentBrowseSubs
  timelineEvents: [],
  filteredLogs: [],
  filteredTimeline: [],
  filteredSubGroups: [],

  currentMode: "browse", // "browse" | "compare"
  browseScope: "logs", // "logs" | "timeline" | "subtitles" | "sampledata"
  compareScope: "logs", // "logs" | "subtitles" | "sampledata"
  selectedLogIdx: -1,
  selectedTimelineIdx: -1,
  selectedSubIdx: -1, // indexes filteredSubGroups
  selectedLogKey: null,
  selectedTimelineKey: null,
  selectedSubKey: null,

  sampleData: [], // reloaded per-version by loadBrowseVersion(), like currentBrowseLogs/Subs
  sampleDataById: new Map(), // O(1) id -> sample record lookup map
  filteredSamples: [],
  sampleScope: "all", // "all" | "field" | "cave"
  selectedSampleIdx: -1,
  selectedSampleKey: null,
  unlockedSamples: new Set(),

  activeSelectionContext: null,
  isApplyingHashState: false,

  displayOn: true,
  brt: 100,
  con: 100,
  sat: 100,
};

/**
 * Returns the key of the currently selected entry in the active Browse scope.
 * @returns {string|null}
 */
export function currentSelectedEntryKey() {
  if (state.browseScope === "logs") return state.selectedLogKey;
  if (state.browseScope === "timeline") return state.selectedTimelineKey;
  if (state.browseScope === "subtitles") return state.selectedSubKey;
  return state.selectedSampleKey;
}

/**
 * Resolves a full SHA, short SHA prefix, or `"local"` against loaded `state.versions`.
 * @param {string} version - Candidate version string from URL hash.
 * @returns {string} Matching full SHA (or `"local"`), or empty string if ambiguous/missing.
 */
export function resolveVersionSha(version) {
  if (!version) return "";
  const exact = state.versions.find((v) => v.sha === version);
  if (exact) return exact.sha;
  const matches = state.versions.filter((v) => v.sha.startsWith(version));
  return matches.length === 1 ? matches[0].sha : "";
}
