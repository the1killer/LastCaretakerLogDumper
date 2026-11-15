import { logPageKey } from "./logs.js";

const TIMELINE_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_PATTERN = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const RE_MONTH_DAY_YEAR = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+((?:18|19|20|21)\\d\\d)\\b`, "i");
const RE_DAY_MONTH_YEAR = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\.?,?\\s+((?:18|19|20|21)\\d\\d)\\b`, "i");
const RE_DMY_NUMERIC = /\b(\d{1,2})[.-](\d{1,2})[.-]((?:18|19|20|21)\d\d)\b/;
const RE_ISO_DATE = /\b((?:18|19|20|21)\d\d)[.-](\d{2})[.-](\d{2})\b/;
const RE_MONTH_YEAR = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+((?:18|19|20|21)\\d\\d)\\b`, "i");
const RE_YEAR_ONLY = /\b((?:18|19|20|21)\d\d)\b/;

/**
 * Extracts the first recognizable date from a log fragment title, description, or log title.
 * @param {string} text - Text to inspect for a date.
 * @returns {{year: number, month: number, day: number, displayDate: string}|null}
 */
export function extractTimelineDate(text) {
  if (!text) return null;

  let m = RE_MONTH_DAY_YEAR.exec(text);
  if (m) {
    const mon = TIMELINE_MONTHS[m[1].toLowerCase().replace(/\.$/, "")];
    const day = parseInt(m[2], 10);
    if (day >= 1 && day <= 31) {
      return { year: parseInt(m[3], 10), month: mon, day, displayDate: `${m[1]} ${day}, ${m[3]}` };
    }
  }

  m = RE_DAY_MONTH_YEAR.exec(text);
  if (m) {
    const mon = TIMELINE_MONTHS[m[2].toLowerCase().replace(/\.$/, "")];
    const day = parseInt(m[1], 10);
    if (day >= 1 && day <= 31) {
      return { year: parseInt(m[3], 10), month: mon, day, displayDate: `${m[2]} ${day}, ${m[3]}` };
    }
  }

  m = RE_DMY_NUMERIC.exec(text);
  if (m) {
    const yr = parseInt(m[3], 10);
    const mon = parseInt(m[2], 10);
    const day = parseInt(m[1], 10);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return { year: yr, month: mon, day, displayDate: `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    }
  }

  m = RE_ISO_DATE.exec(text);
  if (m) {
    const yr = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return { year: yr, month: mon, day, displayDate: `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    }
  }

  m = RE_MONTH_YEAR.exec(text);
  if (m) {
    const mon = TIMELINE_MONTHS[m[1].toLowerCase().replace(/\.$/, "")];
    return { year: parseInt(m[2], 10), month: mon, day: 1, displayDate: `${m[1]} ${m[2]}` };
  }

  m = RE_YEAR_ONLY.exec(text);
  if (m) {
    const yr = parseInt(m[1], 10);
    return { year: yr, month: 1, day: 1, displayDate: `${yr}` };
  }

  return null;
}

/**
 * Extracts and chronologically sorts dated events from voyage log fragments
 * and optional curated in-game asset entries (e.g., `site/timeline/data.json`).
 * Pre-computes `_haystack` for fast client-side filtering.
 * @param {Array<object>} logs - Normalized voyage logs array.
 * @param {Array<object>} [extraEntries] - Optional curated timeline entries (`{ name, date, additionalInformation, source }`).
 * @returns {Array<object>} Sorted timeline event objects.
 */
export function buildTimelineEvents(logs, extraEntries = []) {
  const events = [];
  (logs || []).forEach((log) => {
    const fragments = log.fragments || [];
    fragments.forEach((frag, fIdx) => {
      let dt = extractTimelineDate(frag.title);
      if (!dt && frag.description) {
        dt = extractTimelineDate(frag.description.slice(0, 300));
      }
      if (!dt) {
        dt = extractTimelineDate(log.title);
      }
      if (dt) {
        const fragId = frag.id || `${log.id}:${fIdx}`;
        const logTitle = (log.title || "").trim();
        const fragmentTitle = (frag.title || "").trim();
        const fragmentDesc = (frag.description || "").trim();
        events.push({
          key: fragId,
          year: dt.year,
          month: dt.month,
          day: dt.day,
          displayDate: dt.displayDate,
          logId: log.id || "",
          logTitle,
          fragmentId: fragId,
          fragmentTitle,
          fragmentDesc,
          pageKey: logPageKey(frag, fIdx),
          isAsset: false,
          _haystack: `${dt.displayDate} ${logTitle} ${log.id || ""} ${fragmentTitle} ${fragmentDesc}`.toLowerCase(),
        });
      }
    });
  });

  (extraEntries || []).forEach((entry, idx) => {
    const dt = extractTimelineDate(entry?.date);
    if (!dt) return;
    const name = String(entry.name || entry.title || "").trim();
    const info = String(entry.additionalInformation || entry.description || "").trim();
    const source = String(entry.source || "In-Game Asset").trim();
    const key = entry.id ? String(entry.id) : `asset:${idx}:${name || dt.displayDate}`;
    events.push({
      key,
      year: dt.year,
      month: dt.month,
      day: dt.day,
      displayDate: dt.displayDate,
      logId: "In-Game Asset",
      logTitle: source,
      fragmentId: key,
      fragmentTitle: name || source,
      fragmentDesc: info,
      pageKey: "1",
      isAsset: true,
      _haystack: `${dt.displayDate} ${source} ${name} ${info}`.toLowerCase(),
    });
  });

  events.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    if (a.day !== b.day) return a.day - b.day;
    if (a.logId !== b.logId) return a.logId.localeCompare(b.logId);
    return a.fragmentId.localeCompare(b.fragmentId);
  });

  return events;
}
