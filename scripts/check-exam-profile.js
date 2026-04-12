const mysql = require("mysql2/promise");
const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const db=await mysql.createConnection({host:"mysqldb",port:3306,user:"root",password:"driving123",database:"driving_school_v2"});
  const [rows]=await db.execute("SELECT student_id,full_name,phone_number FROM student WHERE full_name LIKE '%Arsalaan%' OR full_name LIKE '%arsalaan%'");

  for(const r of rows){
    console.log("MySQL:",r.student_id,"|",r.full_name,"|",r.phone_number);

    // Now test the exam query the same way the API does
    const nameParts=r.full_name.trim().split(/\s+/).filter(p=>p.length>=2);
    const phone=(r.phone_number||"").replace(/\D/g,"");
    const phoneSearch=phone.length>10?phone.slice(-10):phone;

    const examNameConditions=[
      {studentName:{contains:r.full_name}},
      ...nameParts.map(part=>({studentName:{contains:part}})),
    ];
    const examPhoneConditions=phoneSearch.length>=7
      ?[{studentPhone:{contains:phoneSearch}}]
      :[];

    const examAttempts=await p.examAttempt.findMany({
      where:{OR:[...examNameConditions,...examPhoneConditions]},
      include:{exam:{select:{code:true,groupName:true}}},
    });

    console.log("Found",examAttempts.length,"exam attempts:");
    for(const a of examAttempts){
      console.log("  ->",a.studentName,"| Score:",a.score,"| Passed:",a.passed);
    }
  }

  await db.end();
  await p.$disconnect();
})();
