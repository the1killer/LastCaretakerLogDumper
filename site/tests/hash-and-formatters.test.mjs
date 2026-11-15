import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  formatDuration,
  formatDate,
  firstLine,
  normalizeSelectedText,
  trimmedSelectionText,
  resolveSelectedIndex,
  stepIndex,
} from "../js/core/formatters.js";
import { state, resolveVersionSha } from "../js/state/store.js";
import { shortSha, parseAppHash, parseBrowseHash, buildBrowseHash } from "../js/state/router.js";

test("formatters, list helpers, and hash routing", async (t) => {
  await t.test("formatters escape HTML and format values accurately", () => {
    assert.strictEqual(escapeHtml('<script>"test\'&</script>'), "&lt;script&gt;&quot;test&#39;&amp;&lt;/script&gt;");
    assert.strictEqual(formatDuration(3.456), "3.5s");
    assert.strictEqual(formatDuration(null), "");
    assert.strictEqual(formatDate("2026-11-11T12:00:00Z"), "2026-11-11");
    assert.strictEqual(firstLine("Line 1\nLine 2"), "Line 1");
    assert.strictEqual(normalizeSelectedText("  hello \n\t world  "), "hello world");
    assert.strictEqual(trimmedSelectionText("x".repeat(250)).length, 198);
    assert.ok(trimmedSelectionText("x".repeat(250)).endsWith("…"));
  });

  await t.test("resolveSelectedIndex and stepIndex handle clamping and wrap-around", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.strictEqual(resolveSelectedIndex([], "id", "a", 0), -1);
    assert.strictEqual(resolveSelectedIndex(items, "id", "b", 0), 1);
    assert.strictEqual(resolveSelectedIndex(items, "id", "missing", 5), 0);
    assert.strictEqual(stepIndex(0, 3, -1), 2);
    assert.strictEqual(stepIndex(2, 3, 1), 0);
    assert.strictEqual(stepIndex(0, 0, 1), -1);
  });

  await t.test("resolveVersionSha and shortSha handle SHAs and 'local'", () => {
    state.versions = [
      { sha: "local", message: "Working Copy", date: "2026-11-11" },
      { sha: "4da9edafb547df247a5c5cf3032281a9065b345c", message: "Update", date: "2026-11-10" },
    ];
    assert.strictEqual(shortSha("local"), "local");
    assert.strictEqual(shortSha("4da9edafb547"), "4da9eda");
    assert.strictEqual(resolveVersionSha("local"), "local");
    assert.strictEqual(resolveVersionSha("4da9eda"), "4da9edafb547df247a5c5cf3032281a9065b345c");
    assert.strictEqual(resolveVersionSha("deadbeef"), "");
  });

  await t.test("parseAppHash validates browse and compare routes safely", () => {
    const browse = parseAppHash("#mode=browse&scope=timeline&version=local&entry=F_1&sampleScope=cave&unlocked=1");
    assert.deepStrictEqual(browse, {
      mode: "browse",
      scope: "timeline",
      version: "local",
      entry: "F_1",
      page: "",
      text: "",
      sampleScope: "cave",
      unlocked: true,
    });

    const sanitizedBrowse = parseAppHash("#mode=browse&scope=bad&version=../evil&sampleScope=bogus");
    assert.strictEqual(sanitizedBrowse.scope, "logs");
    assert.strictEqual(sanitizedBrowse.version, "");
    assert.strictEqual(sanitizedBrowse.sampleScope, "all");

    const compare = parseAppHash("#mode=compare&scope=subtitles&from=4da9eda&to=local");
    assert.deepStrictEqual(compare, {
      mode: "compare",
      scope: "subtitles",
      from: "4da9eda",
      to: "local",
    });

    assert.strictEqual(parseBrowseHash("#mode=compare&scope=logs"), null);
    assert.strictEqual(parseAppHash("#mode=unknown"), null);
  });

  await t.test("buildBrowseHash serializes active browse state", () => {
    state.browseScope = "sampledata";
    state.currentBrowseSha = "local";
    state.selectedSampleKey = "13";
    state.sampleScope = "field";
    state.unlockedSamples.clear();
    state.unlockedSamples.add("13");

    const hash = buildBrowseHash({ page: "field-reading", text: "Hello" });
    const params = new URLSearchParams(hash);
    assert.strictEqual(params.get("mode"), "browse");
    assert.strictEqual(params.get("scope"), "sampledata");
    assert.strictEqual(params.get("version"), "local");
    assert.strictEqual(params.get("entry"), "13");
    assert.strictEqual(params.get("sampleScope"), "field");
    assert.strictEqual(params.get("page"), "field-reading");
    assert.strictEqual(params.get("text"), "Hello");
    assert.strictEqual(params.get("unlocked"), "1");
  });
});
