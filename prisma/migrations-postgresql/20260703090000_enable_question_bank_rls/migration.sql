-- Harden Supabase-exposed question bank tables added after the initial RLS migration.
--
-- The app accesses these tables through the server-side Prisma connection.
-- Do not FORCE RLS here: the database owner used by Prisma must keep working,
-- while Supabase anon/authenticated API roles should not get direct table access.

ALTER TABLE IF EXISTS public."ProblemUnit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."QuestionBankProblem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."WorksheetGeneration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."WorksheetProblem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."QuestionBankPdf" ENABLE ROW LEVEL SECURITY;
