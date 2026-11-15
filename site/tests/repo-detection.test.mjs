import test from "node:test";
import assert from "node:assert/strict";
import {
  detectRepo,
  DEFAULT_REPO,
  isValidVersionSha,
  buildVersionList,
  VERSION_CACHE_TTL_MS,
} from "../js/api/github.js";

test("detectRepo and version validation", async (t) => {
  await t.test("DEFAULT_REPO points to upstream repository", () => {
    assert.strictEqual(DEFAULT_REPO, "the1killer/LastCaretakerLogDumper");
  });

  await t.test("respects valid ?repo= query override", () => {
    assert.strictEqual(
      detectRepo({ search: "?repo=custom-owner/custom.repo_1", hostname: "localhost", pathname: "/" }),
      "custom-owner/custom.repo_1"
    );
  });

  await t.test("rejects invalid ?repo= overrides (path traversal / scheme injection) and falls back", () => {
    assert.strictEqual(
      detectRepo({ search: "?repo=../../etc/passwd", hostname: "localhost", pathname: "/" }),
      DEFAULT_REPO
    );
    assert.strictEqual(
      detectRepo({ search: "?repo=https://evil.com/x", hostname: "localhost", pathname: "/" }),
      DEFAULT_REPO
    );
  });

  await t.test("detects owner/repo from github.io URLs", () => {
    assert.strictEqual(
      detectRepo({ search: "", hostname: "the1killer.github.io", pathname: "/LastCaretakerLogDumper/" }),
      "the1killer/LastCaretakerLogDumper"
    );
  });

  await t.test("falls back to DEFAULT_REPO on localhost or missing repo path", () => {
    assert.strictEqual(detectRepo({ search: "", hostname: "localhost", pathname: "/site/" }), DEFAULT_REPO);
    assert.strictEqual(detectRepo({ search: "", hostname: "user.github.io", pathname: "/" }), DEFAULT_REPO);
  });

  await t.test("isValidVersionSha allows hex SHAs and 'local' only", () => {
    assert.strictEqual(isValidVersionSha("local"), true);
    assert.strictEqual(isValidVersionSha("4da9eda"), true);
    assert.strictEqual(isValidVersionSha("4da9edafb547df247a5c5cf3032281a9065b345c"), true);
    assert.strictEqual(isValidVersionSha("../main"), false);
    assert.strictEqual(isValidVersionSha("not-hex!"), false);
    assert.strictEqual(isValidVersionSha(""), false);
  });
});

test("buildVersionList caching and GitHub Pages error handling", async (t) => {
  function createMemoryStorage() {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
    };
  }

  await t.test("throws on GitHub Pages when GitHub API fails and no cache or static manifest exists", async () => {
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
    try {
      await assert.rejects(
        () =>
          buildVersionList({
            repo: "the1killer/LastCaretakerLogDumper",
            loc: { hostname: "the1killer.github.io", pathname: "/LastCaretakerLogDumper/", search: "" },
            fetchStatic: async () => null,
            fetchCommits: async () => {
              throw new Error("GitHub API rate limit exceeded.");
            },
          }),
        /rate limit/
      );
    } finally {
      if (originalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalStorage;
    }
  });

  await t.test("uses static versions.json on GitHub Pages without hitting GitHub REST API unless ?repo= is set", async () => {
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
    const manifest = [{ sha: "1111111222222", message: "From manifest", date: "2026-11-12T12:00:00Z" }];
    try {
      const fromStatic = await buildVersionList({
        repo: "the1killer/LastCaretakerLogDumper",
        loc: { hostname: "the1killer.github.io", pathname: "/LastCaretakerLogDumper/", search: "" },
        fetchStatic: async () => manifest,
        fetchCommits: async () => {
          throw new Error("GitHub REST API should not be called when static manifest is available");
        },
      });
      assert.deepStrictEqual(fromStatic, manifest);

      const fromOverride = await buildVersionList({
        repo: "other/fork",
        loc: { hostname: "the1killer.github.io", pathname: "/LastCaretakerLogDumper/", search: "?repo=other/fork" },
        fetchStatic: async () => {
          throw new Error("Static manifest should not be used when ?repo= override is present");
        },
        fetchCommits: async (path) =>
          path === "voyage_logs_dump.json"
            ? [{ sha: "aaaaaaa1111111", message: "Fork commit", date: "2026-11-12T13:00:00Z" }]
            : [],
      });
      assert.strictEqual(fromOverride[0].sha, "aaaaaaa1111111");
    } finally {
      if (originalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalStorage;
    }
  });

  await t.test("falls back to local working copy on localhost when GitHub API fails", async () => {
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
    try {
      const versions = await buildVersionList({
        repo: "the1killer/LastCaretakerLogDumper",
        loc: { hostname: "localhost", pathname: "/site/", search: "" },
        fetchStatic: async () => null,
        fetchCommits: async () => {
          throw new Error("Offline");
        },
      });
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].sha, "local");
    } finally {
      if (originalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalStorage;
    }
  });

  await t.test("caches commits in localStorage within TTL and falls back to stale cache on API failure", async () => {
    const originalStorage = globalThis.localStorage;
    const storage = createMemoryStorage();
    globalThis.localStorage = storage;
    let calls = 0;
    const pagesLoc = { hostname: "the1killer.github.io", pathname: "/LastCaretakerLogDumper/", search: "" };
    try {
      const first = await buildVersionList({
        repo: "the1killer/LastCaretakerLogDumper",
        loc: pagesLoc,
        fetchStatic: async () => null,
        fetchCommits: async (path) => {
          calls++;
          if (path === "voyage_logs_dump.json") {
            return [{ sha: "abcdef1234567", message: "Update logs", date: "2026-11-12T10:00:00Z" }];
          }
          return [];
        },
      });
      assert.strictEqual(first.length, 1);
      assert.strictEqual(calls, 5);

      const second = await buildVersionList({
        repo: "the1killer/LastCaretakerLogDumper",
        loc: pagesLoc,
        fetchStatic: async () => null,
        fetchCommits: async () => {
          throw new Error("Should not be called while cache is fresh");
        },
      });
      assert.deepStrictEqual(second, first);

      // Expire the cache and simulate rate-limit failure
      const key = "lastcaretaker:versions:the1killer/LastCaretakerLogDumper";
      const parsed = JSON.parse(storage.getItem(key));
      parsed.fetchedAt = Date.now() - VERSION_CACHE_TTL_MS - 1000;
      storage.setItem(key, JSON.stringify(parsed));

      const staleFallback = await buildVersionList({
        repo: "the1killer/LastCaretakerLogDumper",
        loc: pagesLoc,
        fetchStatic: async () => null,
        fetchCommits: async () => {
          throw new Error("GitHub API rate limit exceeded.");
        },
      });
      assert.deepStrictEqual(staleFallback, first);
    } finally {
      if (originalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalStorage;
    }
  });
});
