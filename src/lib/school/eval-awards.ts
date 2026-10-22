export type ClassEvalRow = {
  student_id: number | string;
  card_id?: number | string | null;
  is_award?: boolean;
  period_no?: number | string | null;
  points: number | string;
  bucket: string;
  column_id?: string | null;
};

type CurrentTally = {
  tasks: number;
  quizzes: number;
  positive: number;
  negative: number;
};

type PeriodTally = {
  tasks: number;
  quizzes: number;
};

export function aggregateClassEvalRows(
  rows: readonly ClassEvalRow[],
  openPeriod: number | null,
) {
  const tally = new Map<number, CurrentTally>();
  const periodTally = new Map<string, PeriodTally>();
  const awardCounts = new Map<number, Map<number, number>>();

  for (const row of rows) {
    const studentId = Number(row.student_id);
    if (row.is_award) {
      const studentAwards = awardCounts.get(studentId) ?? new Map<number, number>();
      const cardId = Number(row.card_id) || 0;
      studentAwards.set(cardId, (studentAwards.get(cardId) ?? 0) + 1);
      awardCounts.set(studentId, studentAwards);
      continue;
    }

    const periodNo = Number(row.period_no) || 1;
    const key = `${studentId}:${periodNo}`;
    const points = Number(row.points);
    if (!row.column_id) {
      const bucket = periodTally.get(key) ?? { tasks: 0, quizzes: 0 };
      if (row.bucket === "quizzes") bucket.quizzes += points;
      else bucket.tasks += points;
      periodTally.set(key, bucket);
    }

    if (openPeriod != null && periodNo !== openPeriod) continue;
    const current = tally.get(studentId) ?? { tasks: 0, quizzes: 0, positive: 0, negative: 0 };
    if (row.bucket === "quizzes") current.quizzes += points;
    else current.tasks += points;
    if (points >= 0) current.positive += 1;
    else current.negative += 1;
    tally.set(studentId, current);
  }

  return { awardCounts, periodTally, tally };
}

export type AwardEvalRow = {
  id: number | string;
  student_id: number | string;
  card_id: number | string | null;
  is_award: boolean;
};

export function latestAwardEvalIdsForUndo(
  rows: readonly AwardEvalRow[],
  studentIds: readonly number[],
  cardId: number,
) {
  const selectedStudents = new Set(studentIds);
  const latestByStudent = new Map<number, number>();

  for (const row of rows) {
    const studentId = Number(row.student_id);
    const id = Number(row.id);
    if (
      !row.is_award ||
      Number(row.card_id) !== cardId ||
      !selectedStudents.has(studentId) ||
      !Number.isSafeInteger(id)
    ) {
      continue;
    }
    const currentId = latestByStudent.get(studentId);
    if (currentId == null || id > currentId) latestByStudent.set(studentId, id);
  }

  return [...latestByStudent.values()];
}
