const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const members=await p.groupMember.findMany({
    where:{groupId:"120363427864783972@g.us"},
    include:{contact:true}
  });
  for(const m of members){
    console.log("JID:",m.contactId,"| phone:",m.phone,"| name:",m.contact.name||"NULL");
  }
  // Also check if there are duplicate contacts with different JIDs
  const phones=["12638660008","14382250806","14383222802","14387220539","14388331055","15144511190","15146679313","15147091481","15149752970"];
  console.log("\n--- Contacts matching these phones ---");
  for(const ph of phones){
    const contacts=await p.contact.findMany({where:{phone:{contains:ph.slice(-10)}}});
    for(const c of contacts){
      console.log("ID:",c.id,"| phone:",c.phone,"| name:",c.name||"NULL");
    }
  }
  await p.$disconnect();
})()
