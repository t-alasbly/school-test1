// @ts-nocheck

export async function cleanupDuplicateStudentsBySimilarity(db) {
    // جلب جميع الطلاب من قاعدة البيانات
    const students = await db.query("SELECT * FROM students ORDER BY id ASC");
    
    const seenNames = new Map();
    let removedCount = 0;

    for (const student of students) {
        // توحيد شكل الاسم للمقارنة بدقة
        const cleanName = student.name
            .replace(/\s+/g, " ")
            .trim()
            .replace(/أ|إ|آ/g, "إ")
            .replace(/ة/g, "ه");

        const matchKey = `${cleanName}_${student.stageName}_${student.className}`;

        if (seenNames.has(matchKey)) {
            const primaryStudent = seenNames.get(matchKey);

            // نقل المخالفات والملاحظات إلى السجل الأساسي
            await db.query(
                "UPDATE student_violations SET student_id = ? WHERE student_id = ?",
                [primaryStudent.id, student.id]
            );
            await db.query(
                "UPDATE student_notes SET student_id = ? WHERE student_id = ?",
                [primaryStudent.id, student.id]
            );
            await db.query(
                "UPDATE student_messages SET student_id = ? WHERE student_id = ?",
                [primaryStudent.id, student.id]
            );

            // حذف السجل الزائد المكرر نهائياً
            await db.query("DELETE FROM students WHERE id = ?", [student.id]);
            removedCount++;
        } else {
            seenNames.set(matchKey, student);
        }
    }

    return {
        success: true,
        removedDuplicates: removedCount,
        message: `تم بنجاح حذف ${removedCount} سجل مكرر بناءً على تشابه الاسم، ونقل كافة المخالفات والملاحظات للسجل الأساسي.`
    };
}