ALTER TABLE "Column" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Card" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Comment" ADD COLUMN "externalAuthorId" TEXT, ADD COLUMN "externalAuthorName" TEXT;
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_userId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ImportBatch" (
  "id" TEXT PRIMARY KEY, "source" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "plan" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING', "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE TABLE "ImportedEntity" (
  "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "kind" TEXT NOT NULL, "externalId" TEXT NOT NULL,
  "targetId" TEXT, "status" TEXT NOT NULL, "original" JSONB NOT NULL,
  CONSTRAINT "ImportedEntity_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ImportedEntity_batchId_kind_externalId_key" ON "ImportedEntity"("batchId", "kind", "externalId");
CREATE INDEX "ImportedEntity_targetId_kind_idx" ON "ImportedEntity"("targetId", "kind");
