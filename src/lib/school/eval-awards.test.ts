import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateClassEvalRows, latestAwardEvalIdsForUndo } from "./eval-awards.ts";

describe("class evaluation awards", () => {
  it("counts awards as badges without adding them to grade totals", () => {
    const result = aggregateClassEvalRows(
      [
        { student_id: 7, card_id: 21, is_award: true, period_no: 1, points: 40, bucket: "tasks" },
        { student_id: 7, card_id: 22, is_award: true, period_no: 1, points: 30, bucket: "tasks" },
        { student_id: 7, card_id: 21, is_award: true, period_no: 1, points: 40, bucket: "tasks" },
        { student_id: 7, card_id: null, is_award: false, period_no: 1, points: 6, bucket: "tasks" },
      ],
      1,
    );
    const awards = result.awardCounts.get(7);

    assert.equal(awards?.get(21), 2);
    assert.equal(awards?.get(22), 1);
    assert.equal(Array.from(awards?.values() ?? []).reduce((sum, count) => sum + count, 0), 3);
    assert.equal(result.tally.get(7)?.tasks, 6);
    assert.equal(result.periodTally.get("7:1")?.tasks, 6);
  });

  it("selects only the latest matching award for selected students", () => {
    const rows = [
      { id: 1, student_id: 7, card_id: 21, is_award: true },
      { id: 2, student_id: 7, card_id: 22, is_award: true },
      { id: 3, student_id: 7, card_id: 21, is_award: true },
      { id: 4, student_id: 7, card_id: 21, is_award: false },
      { id: 5, student_id: 8, card_id: 21, is_award: true },
      { id: 6, student_id: 9, card_id: 21, is_award: true },
    ];
    const removedIds = latestAwardEvalIdsForUndo(rows, [7, 8], 21);

    assert.deepEqual([...removedIds].sort((a, b) => a - b), [3, 5]);
    const remainingIds = rows
      .filter((row) => !removedIds.includes(row.id))
      .map((row) => row.id)
      .sort((a, b) => a - b);
    assert.deepEqual(remainingIds, [1, 2, 4, 6]);
  });
});
