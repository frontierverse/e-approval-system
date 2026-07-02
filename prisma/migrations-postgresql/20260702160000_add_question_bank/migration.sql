CREATE TABLE "ProblemUnit" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionBankProblem" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "body" TEXT NOT NULL,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "problemType" TEXT NOT NULL DEFAULT 'multiple-choice',
    "points" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "QuestionBankProblem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorksheetGeneration" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "questionCount" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "includeAnswers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "WorksheetGeneration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorksheetProblem" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,

    CONSTRAINT "WorksheetProblem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemUnit_subject_gradeLevel_idx" ON "ProblemUnit"("subject", "gradeLevel");
CREATE INDEX "ProblemUnit_parentId_idx" ON "ProblemUnit"("parentId");
CREATE INDEX "ProblemUnit_sortOrder_idx" ON "ProblemUnit"("sortOrder");
CREATE INDEX "ProblemUnit_createdAt_idx" ON "ProblemUnit"("createdAt");

CREATE INDEX "QuestionBankProblem_unitId_idx" ON "QuestionBankProblem"("unitId");
CREATE INDEX "QuestionBankProblem_subject_gradeLevel_idx" ON "QuestionBankProblem"("subject", "gradeLevel");
CREATE INDEX "QuestionBankProblem_difficulty_idx" ON "QuestionBankProblem"("difficulty");
CREATE INDEX "QuestionBankProblem_problemType_idx" ON "QuestionBankProblem"("problemType");
CREATE INDEX "QuestionBankProblem_isActive_createdAt_idx" ON "QuestionBankProblem"("isActive", "createdAt");

CREATE INDEX "WorksheetGeneration_unitId_idx" ON "WorksheetGeneration"("unitId");
CREATE INDEX "WorksheetGeneration_createdById_idx" ON "WorksheetGeneration"("createdById");
CREATE INDEX "WorksheetGeneration_createdAt_idx" ON "WorksheetGeneration"("createdAt");

CREATE UNIQUE INDEX "WorksheetProblem_worksheetId_order_key" ON "WorksheetProblem"("worksheetId", "order");
CREATE UNIQUE INDEX "WorksheetProblem_worksheetId_problemId_key" ON "WorksheetProblem"("worksheetId", "problemId");
CREATE INDEX "WorksheetProblem_problemId_idx" ON "WorksheetProblem"("problemId");

ALTER TABLE "ProblemUnit" ADD CONSTRAINT "ProblemUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProblemUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionBankProblem" ADD CONSTRAINT "QuestionBankProblem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProblemUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorksheetGeneration" ADD CONSTRAINT "WorksheetGeneration_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProblemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorksheetGeneration" ADD CONSTRAINT "WorksheetGeneration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorksheetProblem" ADD CONSTRAINT "WorksheetProblem_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "WorksheetGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorksheetProblem" ADD CONSTRAINT "WorksheetProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "QuestionBankProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
