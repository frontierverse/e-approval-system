INSERT INTO "YouthLearningSchedule" (
    "id",
    "scheduleDate",
    "startHour",
    "startMinute",
    "endHour",
    "endMinute",
    "content",
    "repeatsWeekly",
    "recurrenceSourceDate",
    "createdAt",
    "updatedAt",
    "youthId"
)
SELECT
    'weekly_' || substr(md5(source."id" || ':' || occurrence."scheduleDate"), 1, 24),
    occurrence."scheduleDate",
    source."startHour",
    source."startMinute",
    source."endHour",
    source."endMinute",
    source."content",
    false,
    source."scheduleDate",
    NOW(),
    NOW(),
    source."youthId"
FROM "YouthLearningSchedule" source
CROSS JOIN LATERAL (
    SELECT to_char(
        source."scheduleDate"::date + (week_index * interval '7 days'),
        'YYYY-MM-DD'
    ) AS "scheduleDate"
    FROM generate_series(1, 52) AS week_index
) occurrence
WHERE source."repeatsWeekly" = true
  AND source."recurrenceSourceDate" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "YouthLearningSchedule" existing
    WHERE existing."youthId" = source."youthId"
      AND existing."scheduleDate" = occurrence."scheduleDate"
      AND existing."startMinute" < source."endMinute"
      AND source."startMinute" < existing."endMinute"
  )
ON CONFLICT ("youthId", "scheduleDate", "startMinute") DO NOTHING;
