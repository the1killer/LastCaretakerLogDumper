import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLogs, normalizeArrayJson, logPageKey } from "../js/domain/logs.js";

test("logs domain normalizers and page keys", async (t) => {
  await t.test("normalizeLogs handles raw arrays, wrapped payloads, and null", () => {
    assert.deepStrictEqual(normalizeLogs(null), { buildNumber: null, logs: [] });
    assert.deepStrictEqual(normalizeLogs([{ id: "L1" }]), { buildNumber: null, logs: [{ id: "L1" }] });
    assert.deepStrictEqual(
      normalizeLogs({ build_number: "0.8.5", data: [{ id: "L2" }] }),
      { buildNumber: "0.8.5", logs: [{ id: "L2" }] }
    );
  });

  await t.test("normalizeArrayJson handles raw arrays, wrapped payloads, and null", () => {
    assert.deepStrictEqual(normalizeArrayJson(null), []);
    assert.deepStrictEqual(normalizeArrayJson([{ a: 1 }]), [{ a: 1 }]);
    assert.deepStrictEqual(normalizeArrayJson({ data: [{ a: 2 }] }), [{ a: 2 }]);
  });

  await t.test("logPageKey prefers fragment id and falls back to 1-based page index", () => {
    assert.strictEqual(logPageKey({ id: "frag_a" }, 0), "page:frag_a");
    assert.strictEqual(logPageKey({}, 2), "page:3");
    assert.strictEqual(logPageKey(null, 0), "page:1");
  });
});
