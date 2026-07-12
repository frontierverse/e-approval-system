-- Remove the unused question bank feature. Stored PDF files were deleted from
-- object storage before this migration was applied.
DROP TABLE IF EXISTS "WorksheetProblem";
DROP TABLE IF EXISTS "WorksheetGeneration";
DROP TABLE IF EXISTS "QuestionBankPdf";
DROP TABLE IF EXISTS "QuestionBankProblem";
DROP TABLE IF EXISTS "ProblemUnit";
