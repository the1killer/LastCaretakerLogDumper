import test from "node:test";
import assert from "node:assert/strict";
import { isDeepEqual, diffByKey, renderWordDiff } from "../js/domain/diff.js";

test("diffing domain logic: isDeepEqual, diffByKey, and renderWordDiff", async (t) => {
  await t.test("isDeepEqual compares nested objects and arrays accurately", () => {
    assert.strictEqual(isDeepEqual({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 }), true);
    assert.strictEqual(isDeepEqual({ a: 1, b: [2, { c: 3 }] }, { a: 1, b: [2, { c: 4 }] }), false);
    assert.strictEqual(isDeepEqual([1, 2], { 0: 1, 1: 2 }), false);
    assert.strictEqual(isDeepEqual(null, {}), false);
  });

  await t.test("diffByKey accurately calculates added, removed, and changed items", () => {
    const fromList = [
      { id: "1", name: "Item 1", val: "old" },
      { id: "2", name: "Item 2", val: "same" },
      { id: "3", name: "Item 3", val: "to delete" },
    ];
    const toList = [
      { id: "1", name: "Item 1", val: "new" },
      { id: "2", name: "Item 2", val: "same" },
      { id: "4", name: "Item 4", val: "brand new" },
    ];

    const { added, removed, changed } = diffByKey(fromList, toList, (x) => x.id);
    assert.strictEqual(added.length, 1);
    assert.strictEqual(added[0].id, "4");
    assert.strictEqual(removed.length, 1);
    assert.strictEqual(removed[0].id, "3");
    assert.strictEqual(changed.length, 1);
    assert.strictEqual(changed[0].key, "1");
  });

  await t.test("renderWordDiff escapes HTML in fallback mode and uses Diff when present", () => {
    assert.strictEqual(renderWordDiff("Alpha Beta", "Alpha Beta"), "Alpha Beta");
    assert.strictEqual(renderWordDiff("<b>old</b>", "<i>new</i>"), "&lt;b&gt;old&lt;/b&gt; → &lt;i&gt;new&lt;/i&gt;");

    globalThis.Diff = {
      diffWords: () => [
        { value: "hello ", added: false, removed: false },
        { value: "world", removed: true },
        { value: "universe", added: true },
      ],
    };
    try {
      assert.strictEqual(
        renderWordDiff("hello world", "hello universe"),
        'hello <del class="diff-del">world</del><ins class="diff-ins">universe</ins>'
      );
    } finally {
      delete globalThis.Diff;
    }
  });
});
