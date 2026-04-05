const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const groupId = "120363427864783972@g.us";

  // These are the 10 phones actually in the WhatsApp group
  const realMembers = [
    "12638660008",
    "14382250806",
    "14383222802",
    "14387220539",
    "14388331055",
    "15142746948",
    "15144511190",
    "15146679313",
    "15147091481",
    "15149752970"
  ];

  const allMembers = await p.groupMember.findMany({
    where: { groupId },
    include: { contact: true }
  });

  console.log(`Group has ${allMembers.length} members in SQLite`);

  const toRemove = allMembers.filter(m => !realMembers.includes(m.phone));

  if (toRemove.length === 0) {
    console.log("No extra members to remove");
  } else {
    console.log(`Removing ${toRemove.length} extra members:`);
    for (const m of toRemove) {
      console.log(`  ${m.phone} (${m.contact.name || "no name"})`);
      await p.groupMember.delete({
        where: { groupId_contactId: { groupId, contactId: m.contactId } }
      });
    }
    console.log("Done");
  }

  // Update participant count
  await p.group.update({
    where: { id: groupId },
    data: { participantCount: realMembers.length }
  });

  await p.$disconnect();
})();
