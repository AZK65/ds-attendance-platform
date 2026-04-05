const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const r=await p.scheduledMessage.updateMany({
    where:{
      status:"pending",
      isGroupMessage:false,
      groupId:{not:"in-car-reminders"}
    },
    data:{status:"cancelled"}
  });
  console.log("Cancelled",r.count,"individual theory reminders");
  await p.$disconnect();
})()
