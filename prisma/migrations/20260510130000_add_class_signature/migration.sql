-- CreateTable
CREATE TABLE "ClassSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "sessionLabel" TEXT,
    "moduleNumber" INTEGER,
    "sortieNumber" INTEGER,
    "signatureDataUrl" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ClassSignature_eventId_idx" ON "ClassSignature"("eventId");
CREATE INDEX "ClassSignature_studentPhone_idx" ON "ClassSignature"("studentPhone");
CREATE UNIQUE INDEX "ClassSignature_eventId_studentPhone_key" ON "ClassSignature"("eventId", "studentPhone");
