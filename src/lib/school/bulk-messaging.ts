export type BulkMessageCandidate = {
  studentId: number;
  studentName: string;
  classLabel: string;
  parentPhone: string;
  kind: string | null;
};

export function filterBulkCandidates<T extends BulkMessageCandidate>(rows: T[], kind: "absence" | "late") {
  return rows.filter((row) => row.kind === kind && row.parentPhone.trim().length > 0);
}

export function renderBulkMessage(template: string, values: { name: string; classLabel: string; status: string; day: string }) {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{class}", values.classLabel)
    .replaceAll("{status}", values.status)
    .replaceAll("{day}", values.day);
}
