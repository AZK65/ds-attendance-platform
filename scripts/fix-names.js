const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const m=[
    ["12638660008","PRABHJEET KAUR"],
    ["14382250806","MOHAMMAD ABBUBAKAR OOJLA"],
    ["14383222802","JENNIFER LAPRADE"],
    ["14387220539","JOSE CARLOS CHAVEZ"],
    ["14388331055","RAYANE BOUZIDI"],
    ["15144511190","GOLDY"],
    ["15146679313","GURSHARAN KAUR"],
    ["15147091481","MUHAMMED AQIL RIZWAN"],
    ["15149752970","SAJJAD HUSSAIN"]
  ];
  for(const [ph,name] of m){
    await p.contact.update({where:{id:ph+"@c.us"},data:{name}});
    console.log(ph,"->",name);
  }
  console.log("Done");
  await p.$disconnect();
})()
