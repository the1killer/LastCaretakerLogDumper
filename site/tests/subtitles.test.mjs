import test from "node:test";
import assert from "node:assert/strict";
import { subtitleGroupKey, subtitlePartLabel, subtitlePartNumber, groupSubtitles } from "../js/domain/subtitles.js";

test("subtitles domain logic: parsing, part labeling, number extraction, and grouping", async (t) => {
  await t.test("subtitleGroupKey extracts storyline prefix before hyphen and part", () => {
    assert.strictEqual(subtitleGroupKey("CU3_3-1"), "CU3_3");
    assert.strictEqual(subtitleGroupKey("CU3_3-12"), "CU3_3");
    assert.strictEqual(subtitleGroupKey("Quest_Alpha-2b"), "Quest_Alpha");
    assert.strictEqual(subtitleGroupKey("StandaloneName"), "StandaloneName");
    assert.strictEqual(subtitleGroupKey(""), "");
    assert.strictEqual(subtitleGroupKey(null), "");
  });

  await t.test("subtitlePartLabel extracts suffix following hyphen", () => {
    assert.strictEqual(subtitlePartLabel("CU3_3-1"), "1");
    assert.strictEqual(subtitlePartLabel("CU3_3-2_Anna_B"), "2_Anna_B");
    assert.strictEqual(subtitlePartLabel("CU3_3-1a"), "1a");
    assert.strictEqual(subtitlePartLabel("Standalone"), "");
    assert.strictEqual(subtitlePartLabel(undefined), "");
  });

  await t.test("subtitlePartNumber parses leading integer for ordering", () => {
    assert.strictEqual(subtitlePartNumber("CU3_3-1"), 1);
    assert.strictEqual(subtitlePartNumber("CU3_3-10"), 10);
    assert.strictEqual(subtitlePartNumber("CU3_3-2_Anna_B"), 2);
    assert.strictEqual(subtitlePartNumber("Standalone"), 0);
    assert.strictEqual(subtitlePartNumber(null), 0);
  });

  await t.test("groupSubtitles preserves storyline order, sorts parts numerically, and memoizes", () => {
    const rawSubs = [
      { Name: "StoryB-2", Subtitle: "Story B part 2", Duration: 3.5 },
      { Name: "StoryA-10", Subtitle: "Story A part 10", Duration: 1.0 },
      { Name: "StoryB-1", Subtitle: "Story B part 1", Duration: 2.0 },
      { Name: "StoryA-2", Subtitle: "Story A part 2", Duration: 4.0 },
      { Name: "StoryA-1", Subtitle: "Story A part 1", Duration: 1.5 },
    ];

    const grouped = groupSubtitles(rawSubs);
    assert.strictEqual(grouped.length, 2);
    assert.strictEqual(grouped[0].key, "StoryB");
    assert.strictEqual(grouped[0].totalDuration, 5.5);
    assert.strictEqual(grouped[1].key, "StoryA");
    assert.deepStrictEqual(grouped[1].items.map((x) => x.Name), ["StoryA-1", "StoryA-2", "StoryA-10"]);
    assert.strictEqual(grouped[1].totalDuration, 6.5);
    assert.ok(grouped[1].haystack.includes("story a part 10"));

    // Memoization returns identical reference for identical array reference
    assert.strictEqual(groupSubtitles(rawSubs), grouped);
  });

  await t.test("groupSubtitles handles empty lists and missing durations cleanly", () => {
    assert.deepStrictEqual(groupSubtitles([]), []);
    const missingDuration = groupSubtitles([
      { Name: "Solo-1", Subtitle: "No duration" },
      { Name: "Solo-2", Subtitle: "Zero duration", Duration: 0 },
    ]);
    assert.strictEqual(missingDuration[0].totalDuration, 0);
  });
});
