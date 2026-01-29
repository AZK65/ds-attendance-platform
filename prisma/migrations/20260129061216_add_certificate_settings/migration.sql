-- CreateTable
CREATE TABLE "ZoomAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "meetingUUID" TEXT NOT NULL,
    "meetingDate" DATETIME NOT NULL,
    "moduleNumber" INTEGER,
    "matchedRecords" TEXT NOT NULL,
    "absentRecords" TEXT NOT NULL,
    "unmatchedZoom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZoomNameMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoomName" TEXT NOT NULL,
    "whatsappPhone" TEXT NOT NULL,
    "whatsappName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CertificateSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "nextContractNumber" INTEGER NOT NULL DEFAULT 1,
    "nextAttestationNumber" INTEGER NOT NULL DEFAULT 1,
    "attestationNumberEnd" INTEGER NOT NULL DEFAULT 9999,
    "schoolName" TEXT NOT NULL DEFAULT 'École de Conduite Qazi',
    "schoolAddress" TEXT NOT NULL DEFAULT '786 rue Jean-Talon Ouest',
    "schoolCity" TEXT NOT NULL DEFAULT 'Montréal',
    "schoolProvince" TEXT NOT NULL DEFAULT 'QC',
    "schoolPostalCode" TEXT NOT NULL DEFAULT 'H3N 1S2',
    "schoolNumber" TEXT NOT NULL DEFAULT 'L526',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoomAttendance_groupId_meetingUUID_key" ON "ZoomAttendance"("groupId", "meetingUUID");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomNameMatch_zoomName_whatsappPhone_key" ON "ZoomNameMatch"("zoomName", "whatsappPhone");
