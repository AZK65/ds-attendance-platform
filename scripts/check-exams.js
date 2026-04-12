const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const attempts=await p.examAttempt.findMany({orderBy:{startedAt:"desc"},take:10});
  console.log("=== EXAM ATTEMPTS ===");
  for(const a of attempts){
    console.log("Name:",a.studentName,"| Phone:",a.studentPhone,"| Score:",a.score,"| Passed:",a.passed);
  }
  console.log("\n=== MATCHING TEST ===");
  for(const a of attempts){
    const nameParts=a.studentName.trim().split(/\s+/).filter(p=>p.length>=2);
    const conditions=[
      {studentName:{contains:a.studentName}},
      ...nameParts.map(part=>({studentName:{contains:part}})),
    ];
    if(a.studentPhone){
      conditions.push({studentPhone:{contains:a.studentPhone}});
    }
    const found=await p.examAttempt.findMany({where:{OR:conditions}});
    console.log("Search for",a.studentName,"->",found.length,"matches");
  }
  await p.$disconnect();
})();
