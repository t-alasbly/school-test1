import assert from "node:assert/strict";
import test from "node:test";
import { filterBulkCandidates, renderBulkMessage } from "./bulk-messaging.ts";

test("filters only matching attendance rows with a phone number", () => {
  const rows = [
    { studentId: 1, studentName: "أحمد", classLabel: "أ", parentPhone: "0501", kind: "absence" },
    { studentId: 2, studentName: "سارة", classLabel: "ب", parentPhone: "", kind: "absence" },
    { studentId: 3, studentName: "خالد", classLabel: "أ", parentPhone: "0503", kind: "late" },
  ];
  assert.deepEqual(filterBulkCandidates(rows, "absence").map((row) => row.studentId), [1]);
  assert.deepEqual(filterBulkCandidates(rows, "late").map((row) => row.studentId), [3]);
});

test("renders all supported message placeholders", () => {
  assert.equal(
    renderBulkMessage("{name}|{class}|{status}|{day}", { name: "أحمد", classLabel: "أ/1", status: "غائب", day: "15/9" }),
    "أحمد|أ/1|غائب|15/9",
  );
});
