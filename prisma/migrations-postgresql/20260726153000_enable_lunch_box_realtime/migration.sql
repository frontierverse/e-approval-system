BEGIN;

-- Supabase Realtime can only stream tables registered in this publication.
-- The browser never receives direct table access: a server-only, authenticated
-- SSE route subscribes with the service role and forwards invalidation events.
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
      AND tablename = 'LunchBoxCount'
  ) THEN
    ALTER PUBLICATION supabase_realtime
    ADD TABLE public."LunchBoxCount";
  END IF;
END
$$;

COMMIT;
