// Validate repository slug pattern (owner/repo) to prevent path traversal,
// scheme injection, or domain spoofing into GitHub API and raw content requests.
export const REPO_SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;

// Hex SHA or SHA prefix validator (1 to 40 hexadecimal characters).
export const SHA_HEX_RE = /^[0-9a-fA-F]{1,40}$/;

export const DEFAULT_REPO = "the1killer/LastCaretakerLogDumper";

export const VERSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const PATHS = {
  logs: "voyage_logs_dump.json",
  subtitles: "voyage_quest_subtitles_dump.json",
  sampleText: "voyage_sampledata_text_dump.json",
  sampleData: "site/sampledata/data.json",
  timelineData: "site/timeline/data.json",
  sampleImagesDir: "sampledata_images",
};

const fileCache = new Map(); // `${sha}:${path}` -> parsed json | null (missing)

function versionCacheKey(repo) {
  return `lastcaretaker:versions:${repo}`;
}

function readVersionCache(repo) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(versionCacheKey(repo));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.versions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeVersionCache(repo, versions) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(versionCacheKey(repo), JSON.stringify({ fetchedAt: Date.now(), versions }));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

/**
 * Detects the target GitHub repository from `?repo=` override or `*.github.io/<repo>` URL.
 * Falls back to the default repository for local development (`localhost`, `file://`).
 * @param {Location|object} [loc] - Location-like object with search, hostname, pathname.
 * @returns {string} Repository slug in `owner/repo` format.
 */
export function detectRepo(loc = typeof location !== "undefined" ? location : null) {
  if (!loc) return DEFAULT_REPO;
  const override = new URLSearchParams(loc.search || "").get("repo");
  if (override && REPO_SLUG_RE.test(override)) return override;
  const m = /^([^.]+)\.github\.io$/.exec(loc.hostname || "");
  const repoName = m && (loc.pathname || "").split("/").filter(Boolean)[0];
  const detected = m && repoName ? `${m[1]}/${repoName}` : null;
  if (detected && REPO_SLUG_RE.test(detected)) return detected;
  return DEFAULT_REPO;
}

export const REPO = detectRepo();

/**
 * Validates a version SHA or `"local"` working-copy sentinel.
 * @param {string} sha - Candidate version identifier.
 * @returns {boolean} True if valid hex SHA/prefix or `"local"`.
 */
export function isValidVersionSha(sha) {
  return sha === "local" || SHA_HEX_RE.test(String(sha || ""));
}

/**
 * Decodes an ArrayBuffer respecting UTF-16 LE, UTF-16 BE, and UTF-8 BOMs.
 * @param {ArrayBuffer} buf - Raw byte buffer.
 * @returns {string} Decoded text string.
 */
export function decodeArrayBuffer(buf) {
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

/**
 * Fetches and parses a JSON file at a specific commit SHA or from the local working copy.
 * Results are cached per `${sha}:${path}`. Returns `null` on HTTP 404.
 * @param {string} path - Repository-relative path.
 * @param {string} sha - Commit SHA or `"local"`.
 * @returns {Promise<*|null>} Parsed JSON or `null` if missing.
 */
export async function fetchFileAtSha(path, sha) {
  if (!isValidVersionSha(sha)) {
    throw new Error(`Invalid version identifier: ${String(sha || "")}`);
  }
  const key = `${sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);

  let res;
  if (sha === "local") {
    res = await fetch(`../${path}`);
    if (!res.ok) res = await fetch(`/${path}`);
  } else {
    const url = `https://raw.githubusercontent.com/${encodeURI(REPO)}/${encodeURIComponent(sha)}/${path}`;
    res = await fetch(url);
  }

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

/**
 * Lists all GitHub commits touching a given repository path, paginated across all pages.
 * @param {string} path - Repository-relative file path.
 * @param {string} [repo=REPO] - Target repository slug (`owner/repo`).
 * @returns {Promise<Array<{sha: string, message: string, date: string}>>}
 */
export async function fetchCommitsForPath(path, repo = REPO) {
  const commits = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${encodeURI(repo)}/commits?path=${encodeURIComponent(path)}&per_page=100&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) {
      if ((res.status === 403 || res.status === 429) && res.headers?.get?.("x-ratelimit-remaining") === "0") {
        const resetRaw = Number(res.headers.get("x-ratelimit-reset"));
        const resetNote = Number.isFinite(resetRaw) && resetRaw > 0
          ? ` (resets at ${new Date(resetRaw * 1000).toLocaleTimeString()})`
          : "";
        const err = new Error(`GitHub API rate limit exceeded${resetNote}.`);
        err.isRateLimit = true;
        throw err;
      }
      throw new Error(`Failed to list commits for ${path} (${res.status})`);
    }
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

/**
 * Returns true when running from localhost, 127.0.0.1, or file://.
 * @param {Location|object} [loc] - Location-like object.
 * @returns {boolean}
 */
export function isLocalEnvironment(loc = typeof location !== "undefined" ? location : null) {
  return Boolean(
    loc && (loc.hostname === "localhost" || loc.hostname === "127.0.0.1" || loc.protocol === "file:")
  );
}

/**
 * Returns the synthetic version entry for the local working copy.
 * @returns {{sha: string, message: string, date: string}}
 */
export function createLocalVersionEntry() {
  return { sha: "local", message: "Working Copy (Local Dumps)", date: new Date().toISOString() };
}

/**
 * Fetches the pre-generated `versions.json` manifest deployed on GitHub Pages, if present.
 * Returns `null` when unavailable or invalid so callers can fall back to the GitHub REST API.
 * @returns {Promise<Array<{sha: string, message: string, date: string}>|null>}
 */
export async function fetchStaticVersions() {
  if (typeof fetch !== "function") return null;
  try {
    const res = await fetch("versions.json");
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Builds the deduplicated, newest-first version list across all tracked archive files.
 * On GitHub Pages without `?repo=` override, prefers the CI-generated `versions.json`
 * manifest (zero GitHub REST API calls), then falls back to `localStorage`-cached
 * GitHub REST API commit history. Prepends `"Working Copy (Local Dumps)"` locally.
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh=false] - Bypass fresh cache and static manifest when true.
 * @param {string} [options.repo=REPO] - Target repository slug.
 * @param {Location|object|null} [options.loc] - Location-like object for environment detection.
 * @param {function(string, string): Promise<Array>} [options.fetchCommits=fetchCommitsForPath] - Commit fetcher.
 * @param {function(): Promise<Array|null>} [options.fetchStatic=fetchStaticVersions] - Static manifest fetcher.
 * @returns {Promise<Array<{sha: string, message: string, date: string}>>}
 */
export async function buildVersionList(options = {}) {
  const {
    forceRefresh = false,
    repo = REPO,
    loc = typeof location !== "undefined" ? location : null,
    fetchCommits = fetchCommitsForPath,
    fetchStatic = fetchStaticVersions,
  } = options;
  const isLocal = isLocalEnvironment(loc);
  const searchParams = new URLSearchParams(loc?.search || "");
  const repoParam = searchParams.get("repo");
  const hasRepoOverride = Boolean(repoParam && REPO_SLUG_RE.test(repoParam));
  const bypassCache = forceRefresh || searchParams.has("nocache");

  if (!isLocal && !hasRepoOverride && !bypassCache) {
    const staticVersions = await fetchStatic();
    if (staticVersions && staticVersions.length > 0) {
      return staticVersions;
    }
  }

  const cached = readVersionCache(repo);
  if (!bypassCache && cached && cached.versions.length > 0 && Date.now() - cached.fetchedAt < VERSION_CACHE_TTL_MS) {
    return isLocal ? [createLocalVersionEntry(), ...cached.versions] : [...cached.versions];
  }

  const trackedPaths = [PATHS.logs, PATHS.subtitles, PATHS.sampleText, PATHS.sampleData, PATHS.timelineData];
  const results = await Promise.allSettled(trackedPaths.map((p) => fetchCommits(p, repo)));
  const bySha = new Map();
  const errors = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const c of result.value) {
        if (!bySha.has(c.sha)) bySha.set(c.sha, c);
      }
    } else {
      errors.push(result.reason);
    }
  }

  const githubVersions = [...bySha.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (githubVersions.length > 0) {
    writeVersionCache(repo, githubVersions);
    return isLocal ? [createLocalVersionEntry(), ...githubVersions] : githubVersions;
  }

  if (cached && cached.versions.length > 0) {
    console.warn("Could not refresh GitHub commit history; using cached versions:", errors[0] || "empty result");
    return isLocal ? [createLocalVersionEntry(), ...cached.versions] : [...cached.versions];
  }

  if (isLocal) {
    if (errors.length) console.warn("Could not load GitHub commit history:", errors[0]);
    return [createLocalVersionEntry()];
  }

  if (errors.length) {
    throw errors[0];
  }
  return [];
}
