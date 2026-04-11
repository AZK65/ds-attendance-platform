const mysql = require("mysql2/promise");
(async () => {
  const db = await mysql.createConnection({
    host: "mysqldb", port: 3306, user: "root",
    password: "driving123", database: "driving_school_v2"
  });
  const [rows] = await db.execute(
    "SELECT student_id, full_name, contract_number, user_defined_contract_number, phone_number FROM student WHERE full_name LIKE '%Hadi%' OR full_name LIKE '%Siddiqui%'"
  );
  for (const r of rows) {
    console.log("ID:", r.student_id, "|", r.full_name, "| contract:", r.contract_number, "| user_defined:", r.user_defined_contract_number, "| phone:", r.phone_number);
  }
  await db.end();
})();
