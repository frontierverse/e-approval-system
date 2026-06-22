CREATE TABLE "CompanyBusinessInfo" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBusinessInfo_pkey" PRIMARY KEY ("id")
);
