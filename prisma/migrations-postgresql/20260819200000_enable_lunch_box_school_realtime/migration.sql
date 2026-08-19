BEGIN;

-- School metadata and active-state changes affect the fixed preparation list.
-- Register the table so the authenticated SSE bridge can invalidate open views.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'LunchBoxSchool'
  ) THEN
    ALTER PUBLICATION supabase_realtime
    ADD TABLE public."LunchBoxSchool";
  END IF;
END
$$;

COMMIT;
