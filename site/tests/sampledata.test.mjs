import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleCode,
  sampleSiteLabel,
  sampleImageUrl,
  sampleIdSortKey,
  compareSampleIds,
  mergeSampleDataText,
} from "../js/domain/sampledata.js";

test("sampledata domain logic: formatting, sorting, URL validation, and merging", async (t) => {
  await t.test("sampleCode and sampleSiteLabel format field and cave records", () => {
    assert.strictEqual(sampleCode({ id: "13", collection: "field" }), "SD-013");
    assert.strictEqual(sampleCode({ id: "CavePainting_502", collection: "cave" }), "CAVE-502");
    assert.strictEqual(sampleSiteLabel({ collection: "cave", site: "Ignored" }), "Orbit archive");
    assert.strictEqual(sampleSiteLabel({ collection: "field", site: "Refinery" }), "Refinery");
    assert.strictEqual(sampleSiteLabel({ collection: "field", site: null }), "—");
  });

  await t.test("sampleImageUrl handles local, commit SHA, and rejects unsafe IDs", () => {
    assert.strictEqual(sampleImageUrl({ id: "13" }, "local"), "/sampledata_images/SampleData_13.png");
    assert.match(
      sampleImageUrl({ id: "CavePainting_502" }, "4da9eda"),
      /^https:\/\/raw\.githubusercontent\.com\/.*\/4da9eda\/sampledata_images\/SampleData_CavePainting_502\.png$/
    );
    assert.strictEqual(sampleImageUrl({ id: "../secret" }, "4da9eda"), null);
    assert.strictEqual(sampleImageUrl({ id: "13" }, null), null);
  });

  await t.test("sampleIdSortKey and compareSampleIds sort field before cave numerically", () => {
    assert.deepStrictEqual(sampleIdSortKey("DA_SampleData_104"), [0, 104]);
    assert.deepStrictEqual(sampleIdSortKey("DA_SampleData_CavePainting_502"), [1, 502]);
    assert.deepStrictEqual(sampleIdSortKey("Unknown"), [2, 0]);

    const ids = [
      "DA_SampleData_CavePainting_510",
      "DA_SampleData_104",
      "Other",
      "DA_SampleData_13",
      "DA_SampleData_CavePainting_502",
    ];
    ids.sort(compareSampleIds);
    assert.deepStrictEqual(ids, [
      "DA_SampleData_13",
      "DA_SampleData_104",
      "DA_SampleData_CavePainting_502",
      "DA_SampleData_CavePainting_510",
      "Other",
    ]);
  });

  await t.test("mergeSampleDataText overrides unlock text and synthesizes uncurated items", () => {
    const curated = [
      { id: 1, title: "Sample One", short: "Short 1", unlock: "Old" },
      { id: 2, title: "Sample Two", short: "Short 2" },
    ];
    const textDump = [
      { id: "DA_SampleData_1", sentDescription: "Engine dump unlock text 1" },
      { id: "DA_SampleData_2", sentDescription: "" },
      {
        id: "DA_SampleData_99",
        title: "New Hologram",
        uncollectedDescription: "Found at dock",
        sentDescription: "Synthesized unlock",
      },
      {
        id: "DA_SampleData_CavePainting_701",
        title: "Hidden",
        uncollectedDescription: "No peeking",
        sentDescription: "Cave lore",
      },
    ];

    const merged = mergeSampleDataText(curated, textDump);
    assert.strictEqual(merged.length, 4);
    assert.strictEqual(merged[0].unlock, "Engine dump unlock text 1");
    assert.strictEqual(merged[1].unlock, undefined);
    assert.deepStrictEqual(merged[2], {
      id: "99",
      code: "SD-099",
      collection: "field",
      site: null,
      title: "New Hologram",
      short: "Found at dock",
      unlock: "Synthesized unlock",
    });
    assert.deepStrictEqual(merged[3], {
      id: "CavePainting_701",
      code: "CAVE-701",
      collection: "cave",
      site: null,
      title: "Cave Painting 701",
      short: "",
      unlock: "Cave lore",
    });
  });
});
