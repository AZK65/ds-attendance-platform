const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const msgs=await p.messageLog.findMany({
    where:{status:"failed"},
    orderBy:{createdAt:"desc"},
    take:10
  });
  for(const m of msgs){
    console.log(m.to,"|",m.toName,"|",m.type,"|",m.createdAt,"|",m.message?.slice(0,100));
  }
  await p.$disconnect();
})()
