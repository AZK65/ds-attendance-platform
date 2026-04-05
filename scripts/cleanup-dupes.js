const mysql = require("mysql2/promise");
(async () => {
  const db = await mysql.createConnection({
    host: "mysqldb", port: 3306, user: "root",
    password: "driving123", database: "driving_school_v2"
  });

  // Find duplicates by phone number (keep the one with the lowest student_id)
  const [dupes] = await db.execute(`
    SELECT s.student_id, s.full_name, s.phone_number
    FROM student s
    INNER JOIN (
      SELECT phone_number, MIN(student_id) AS keep_id
      FROM student
      WHERE phone_number != '' AND phone_number IS NOT NULL
      GROUP BY phone_number
      HAVING COUNT(*) > 1
    ) d ON s.phone_number = d.phone_number AND s.student_id != d.keep_id
    ORDER BY s.phone_number, s.student_id
  `);

  if (dupes.length === 0) {
    console.log("No duplicates found");
    await db.end();
    return;
  }

  console.log(`Found ${dupes.length} duplicate rows to remove:`);
  for (const d of dupes) {
    console.log(`  ID ${d.student_id}: ${d.full_name} (${d.phone_number})`);
  }

  // Delete the duplicates (keeping the original with lowest ID)
  const ids = dupes.map(d => d.student_id);
  await db.execute(
    `DELETE FROM student WHERE student_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  console.log(`\nDeleted ${ids.length} duplicate rows`);

  await db.end();
})();
