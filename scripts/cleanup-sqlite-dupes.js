const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  // Find duplicate GroupMember entries (same phone in same group)
  const allMembers = await p.groupMember.findMany();
  const seen = new Map();
  const toDelete = [];

  for (const m of allMembers) {
    const key = `${m.groupId}:${m.phone}`;
    if (seen.has(key)) {
      toDelete.push(m);
    } else {
      seen.set(key, m);
    }
  }

  if (toDelete.length > 0) {
    console.log(`Found ${toDelete.length} duplicate GroupMember entries:`);
    for (const m of toDelete) {
      console.log(`  ${m.phone} in group ${m.groupId.slice(0, 20)}...`);
      await p.groupMember.delete({
        where: { groupId_contactId: { groupId: m.groupId, contactId: m.contactId } }
      }).catch(() => {});
    }
    console.log(`Deleted ${toDelete.length} duplicate members`);
  } else {
    console.log("No duplicate GroupMember entries");
  }

  // Find duplicate Contact entries (same phone, different JID)
  const allContacts = await p.contact.findMany();
  const phoneMap = new Map();
  const contactsToDelete = [];

  for (const c of allContacts) {
    const phone10 = c.phone.slice(-10);
    if (phoneMap.has(phone10)) {
      contactsToDelete.push(c);
    } else {
      phoneMap.set(phone10, c);
    }
  }

  if (contactsToDelete.length > 0) {
    console.log(`\nFound ${contactsToDelete.length} duplicate Contact entries:`);
    for (const c of contactsToDelete) {
      console.log(`  ${c.id} (${c.name || "no name"})`);
    }
    // Don't auto-delete contacts — they might have group memberships
    console.log("(Not auto-deleting contacts — check manually if needed)");
  } else {
    console.log("\nNo duplicate Contact entries");
  }

  await p.$disconnect();
})();
