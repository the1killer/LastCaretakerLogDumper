import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractTimelineDate, buildTimelineEvents } from "../js/domain/timeline.js";

test("timeline domain logic: date extraction and chronological sorting", async (t) => {
  await t.test("extractTimelineDate supports diverse date formats", () => {
    assert.deepStrictEqual(extractTimelineDate("Log Entry: March 14th, 2068"), {
      year: 2068,
      month: 3,
      day: 14,
      displayDate: "March 14, 2068",
    });
    assert.deepStrictEqual(extractTimelineDate("Recorded 5 Nov 2071"), {
      year: 2071,
      month: 11,
      day: 5,
      displayDate: "Nov 5, 2071",
    });
    assert.deepStrictEqual(extractTimelineDate("2084-07-09 Signal lost"), {
      year: 2084,
      month: 7,
      day: 9,
      displayDate: "2084-07-09",
    });
    assert.deepStrictEqual(extractTimelineDate("04.12.2055 Checkpoint"), {
      year: 2055,
      month: 12,
      day: 4,
      displayDate: "2055-12-04",
    });
    assert.deepStrictEqual(extractTimelineDate("October 2099 Report"), {
      year: 2099,
      month: 10,
      day: 1,
      displayDate: "October 2099",
    });
    assert.deepStrictEqual(extractTimelineDate("Archive from 1989"), {
      year: 1989,
      month: 1,
      day: 1,
      displayDate: "1989",
    });
    assert.strictEqual(extractTimelineDate("No date here"), null);
  });

  await t.test("buildTimelineEvents extracts and sorts dated fragments chronologically", () => {
    const logs = [
      {
        id: "LOG_2",
        title: "Late Report",
        fragments: [
          { id: "F_LATE", title: "2090-05-01 Entry", description: "Later event" },
          { id: "F_NODATE", title: "Undated", description: "Should be skipped" },
        ],
      },
      {
        id: "LOG_1",
        title: "Early Report (2045)",
        fragments: [
          { id: "F_EARLY_B", title: "March 10, 2045", description: "Second early" },
          { id: "F_EARLY_A", title: "Briefing", description: "Dated in description: February 2, 2045." },
        ],
      },
    ];

    const events = buildTimelineEvents(logs);
    assert.strictEqual(events.length, 3);
    assert.deepStrictEqual(events.map((e) => e.fragmentId), ["F_EARLY_A", "F_EARLY_B", "F_LATE"]);
    assert.ok(events[0]._haystack.includes("briefing"));
  });

  await t.test("buildTimelineEvents merges curated extraEntries chronologically and validates site/timeline/data.json", () => {
    const logs = [
      {
        id: "LOG_1",
        title: "Mid Report",
        fragments: [{ id: "F_MID", title: "January 1, 2088", description: "Log entry" }],
      },
    ];
    const extra = [
      {
        name: "Victor Kade",
        date: "January 2, 2099",
        additionalInformation: "b. 2069 — Notable Final Departures",
        source: "Ascension Wall",
      },
      {
        name: "Elias Carver",
        date: "June 9, 2087",
        additionalInformation: "b. 1997 — Ascended in Final Evacuation Waves",
        source: "Ascension Wall",
      },
      {
        name: "Undated Entry",
        date: "unknown",
        additionalInformation: "Should be skipped",
      },
    ];

    const events = buildTimelineEvents(logs, extra);
    assert.strictEqual(events.length, 3);
    assert.deepStrictEqual(
      events.map((e) => e.fragmentTitle),
      ["Elias Carver", "January 1, 2088", "Victor Kade"]
    );
    assert.ok(events[0]._haystack.includes("elias carver"));
    assert.ok(events[0]._haystack.includes("ascension wall"));

    const curated = JSON.parse(readFileSync(new URL("../timeline/data.json", import.meta.url), "utf8"));
    const curatedEvents = buildTimelineEvents([], curated);
    assert.strictEqual(curatedEvents.length, curated.length);
  });
});
