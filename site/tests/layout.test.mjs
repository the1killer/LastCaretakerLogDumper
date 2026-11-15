import test from "node:test";
import assert from "node:assert/strict";
import { isScreenLayoutStacked } from "../app.js";

test("layout detection logic: isScreenLayoutStacked", async (t) => {
  await t.test("returns false when elements are side-by-side with equal top offsets", () => {
    const list = { offsetTop: 20, offsetHeight: 400 };
    const detail = { offsetTop: 20, offsetHeight: 400 };
    assert.strictEqual(isScreenLayoutStacked(list, detail), false);
  });

  await t.test("returns true when detail is vertically below list (stacked layout)", () => {
    const list = { offsetTop: 20, offsetHeight: 180 };
    const detail = { offsetTop: 220, offsetHeight: 400 };
    assert.strictEqual(isScreenLayoutStacked(list, detail), true);
  });

  await t.test("returns false for side-by-side using bounding client rects", () => {
    const list = {
      getBoundingClientRect: () => ({ top: 50, bottom: 450, left: 10, right: 300 }),
    };
    const detail = {
      getBoundingClientRect: () => ({ top: 50, bottom: 450, left: 320, right: 900 }),
    };
    assert.strictEqual(isScreenLayoutStacked(list, detail), false);
  });

  await t.test("returns true for stacked layout using bounding client rects", () => {
    const list = {
      getBoundingClientRect: () => ({ top: 50, bottom: 200, left: 10, right: 380 }),
    };
    const detail = {
      getBoundingClientRect: () => ({ top: 220, bottom: 600, left: 10, right: 380 }),
    };
    assert.strictEqual(isScreenLayoutStacked(list, detail), true);
  });

  await t.test("handles null or missing elements gracefully", () => {
    assert.strictEqual(isScreenLayoutStacked(null, {}), false);
    assert.strictEqual(isScreenLayoutStacked({}, null), false);
    assert.strictEqual(isScreenLayoutStacked(null, null), false);
  });
});
