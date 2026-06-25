ALTER TABLE "ResourcePost" ADD COLUMN "educationLevel" TEXT;

CREATE INDEX "ResourcePost_category_educationLevel_idx" ON "ResourcePost"("category", "educationLevel");
