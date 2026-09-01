CREATE TABLE "YouthPersonalSchedule" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "selectionMode" TEXT NOT NULL,
    "occurrenceDates" TEXT[] NOT NULL,
    "recurrenceWeekdays" TEXT,
    "recurrenceStartDate" TEXT,
    "recurrenceEndDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "YouthPersonalSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "YouthPersonalSchedule_content_check"
      CHECK (char_length(btrim("content")) BETWEEN 1 AND 200),
    CONSTRAINT "YouthPersonalSchedule_time_check"
      CHECK (
        "startMinute" >= 0
        AND "startMinute" < 1440
        AND "startMinute" % 10 = 0
        AND "endMinute" > "startMinute"
        AND "endMinute" <= 1440
        AND "endMinute" % 10 = 0
      ),
    CONSTRAINT "YouthPersonalSchedule_selectionMode_check"
      CHECK ("selectionMode" IN ('DATES', 'WEEKDAYS')),
    CONSTRAINT "YouthPersonalSchedule_occurrenceDates_check"
      CHECK (cardinality("occurrenceDates") BETWEEN 1 AND 366),
    CONSTRAINT "YouthPersonalSchedule_recurrence_check"
      CHECK (
        (
          "selectionMode" = 'DATES'
          AND "recurrenceWeekdays" IS NULL
          AND "recurrenceStartDate" IS NULL
          AND "recurrenceEndDate" IS NULL
        )
        OR
        (
          "selectionMode" = 'WEEKDAYS'
          AND "recurrenceWeekdays" IS NOT NULL
          AND "recurrenceStartDate" IS NOT NULL
          AND "recurrenceEndDate" IS NOT NULL
          AND "recurrenceWeekdays" ~ '^[0-6](,[0-6])*$'
          AND "recurrenceStartDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND "recurrenceEndDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND "recurrenceEndDate" >= "recurrenceStartDate"
        )
      )
);

CREATE INDEX "YouthPersonalSchedule_youthId_idx"
ON "YouthPersonalSchedule"("youthId");

CREATE INDEX "YouthPersonalSchedule_occurrenceDates_gin_idx"
ON "YouthPersonalSchedule" USING GIN ("occurrenceDates");

ALTER TABLE "YouthPersonalSchedule"
ADD CONSTRAINT "YouthPersonalSchedule_youthId_fkey"
FOREIGN KEY ("youthId") REFERENCES "Youth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "YouthPersonalSchedule" ENABLE ROW LEVEL SECURITY;
