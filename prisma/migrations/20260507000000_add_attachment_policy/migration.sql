-- CreateTable
CREATE TABLE "AttachmentPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxFileCount" INTEGER NOT NULL DEFAULT 5,
    "maxFileSizeMb" INTEGER NOT NULL DEFAULT 10,
    "allowedExtensions" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- SeedDefault
INSERT INTO "AttachmentPolicy" (
    "id",
    "maxFileCount",
    "maxFileSizeMb",
    "allowedExtensions",
    "updatedAt"
) VALUES (
    'default',
    5,
    10,
    '[".pdf",".png",".jpg",".jpeg",".webp",".txt",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".hwp",".hwpx"]',
    CURRENT_TIMESTAMP
);
