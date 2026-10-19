export type SmartLesson = {
  teacherName: string;
  nickname: string;
  day: number;
  period: number;
  stageNo: number;
  classNo: number;
  subject: string;
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function objects(rows: unknown[][]) {
  const header = (rows[0] ?? []).map((cell) => text(cell));
  return rows.slice(1).map((row) => {
    const record: Record<string, unknown> = {};
    header.forEach((key, index) => {
      if (key) record[key] = row[index];
    });
    return record;
  });
}

function classParts(label: string) {
  const match = label.match(/(\d+)\s*[/\\\-]\s*(\d+)/);
  if (!match) return null;
  const stageNo = Number(match[1]);
  const classNo = Number(match[2]);
  if (stageNo < 1 || stageNo > 6 || classNo < 1 || classNo > 30) return null;
  return { stageNo, classNo };
}

export function parseSmartTimetable(sheets: Record<string, unknown[][]>): SmartLesson[] {
  const courseRows = sheets.Courses;
  const cellRows = sheets.Cells;
  if (courseRows?.length && cellRows?.length) {
    const courses = new Map(objects(courseRows).map((row) => [String(row.row_id), row]));
    const nicknames = new Map(objects(sheets.Teachers ?? []).map((row) => [text(row.name), text(row.nickname)]));
    const lessons: SmartLesson[] = [];
    for (const row of objects(cellRows)) {
      if (String(row.activate ?? "1") === "0") continue;
      const course = courses.get(String(row.course_row_id));
      if (!course) continue;
      const place = classParts(text(row.classroom_name) || text(course.classroom_name));
      const subject = text(course.name).slice(0, 40);
      const teacherName = text(course.teacher_name);
      const index = Number(row.cell_number);
      if (!place || !subject || !teacherName || !Number.isInteger(index) || index < 0 || index > 34) continue;
      lessons.push({
        teacherName,
        nickname: nicknames.get(teacherName) || "",
        day: Math.floor(index / 7),
        period: (index % 7) + 1,
        stageNo: place.stageNo,
        classNo: place.classNo,
        subject,
      });
    }
    if (lessons.length) return lessons;
  }
  return parseSheetGrid(sheets.Sheet1 ?? []);
}

function parseSheetGrid(rows: unknown[][]): SmartLesson[] {
  const dayRow = rows.findIndex((row) => row.some((cell) => text(cell) === "الأحد"));
  if (dayRow < 0) return [];
  const periodRow = rows[dayRow + 1] ?? [];
  const columns: { index: number; day: number; period: number }[] = [];
  let day = -1;
  rows[dayRow].forEach((cell, index) => {
    const name = text(cell);
    if (name === "الأحد") day = 0;
    else if (name === "الاثنين") day = 1;
    else if (name === "الثلاثاء") day = 2;
    else if (name === "الأربعاء") day = 3;
    else if (name === "الخميس") day = 4;
    const period = Number(text(periodRow[index]));
    if (day >= 0 && period >= 1 && period <= 7) columns.push({ index, day, period });
  });
  const lessons: SmartLesson[] = [];
  for (const row of rows.slice(dayRow + 2)) {
    const teacherName = text(row[1]);
    if (!teacherName || teacherName === "المعلم") continue;
    for (const column of columns) {
      const raw = text(row[column.index]);
      if (!raw || raw.startsWith("منتظر")) continue;
      const place = classParts(raw);
      const subject = raw.replace(/^\d+\s*[/\\\-]\s*\d+/, "").trim().slice(0, 40);
      if (!place || !subject) continue;
      lessons.push({
        teacherName,
        nickname: teacherName,
        day: column.day,
        period: column.period,
        stageNo: place.stageNo,
        classNo: place.classNo,
        subject,
      });
    }
  }
  return lessons;
}
