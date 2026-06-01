CREATE TABLE "YouthFamilyContact" (
    "id" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "YouthFamilyContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YouthFamilyContact_youthId_idx" ON "YouthFamilyContact"("youthId");
CREATE INDEX "YouthFamilyContact_relationship_idx" ON "YouthFamilyContact"("relationship");

ALTER TABLE "YouthFamilyContact" ADD CONSTRAINT "YouthFamilyContact_youthId_fkey" FOREIGN KEY ("youthId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "YouthFamilyContact" (
    "id",
    "relationship",
    "phone",
    "createdAt",
    "updatedAt",
    "youthId"
)
SELECT
    'legacy-family-' || "id",
    NULLIF("familyRelationship", ''),
    COALESCE(NULLIF("familyPhone", ''), NULLIF("familyContact", '')),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    "id"
FROM "Youth"
WHERE COALESCE(
    NULLIF("familyRelationship", ''),
    NULLIF("familyPhone", ''),
    NULLIF("familyContact", '')
) IS NOT NULL;
