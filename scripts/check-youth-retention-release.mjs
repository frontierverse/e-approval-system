import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { getSupabaseProjectRefFromDatabaseUrl } from './supabase-project-ref.mjs';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const projectRef = getSupabaseProjectRefFromDatabaseUrl(connectionString);
if (!projectRef || projectRef !== process.env.RETENTION_EXPECTED_PROJECT_REF) {
  throw new Error('Retention release database project does not match the reviewed target.');
}
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const migrations = (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name, started_at')).rows;
  if (migrations.some(row => !row.finished_at && !row.rolled_back_at)) {
    throw new Error('A database migration is unfinished.');
  }
  const digest = createHash('sha256').update(JSON.stringify(migrations.map(row => [row.migration_name, row.checksum, Boolean(row.finished_at), Boolean(row.rolled_back_at)]))).digest('hex');
  const youthCount = Number((await client.query('SELECT COUNT(*) FROM "Youth"')).rows[0].count);
  const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Youth' ORDER BY ordinal_position")).rows.map(row => row.column_name);
  const summary = { projectRef, migrationDigest: digest, youthCount, retentionColumnsPresent: ['actualDischargeDate', 'caseClosedDate', 'retentionUntil', 'purgeLeaseUntil', 'purgedAt'].every(column => columns.includes(column)) };
  console.log('RETENTION_RELEASE_DATABASE ' + JSON.stringify(summary));
  if (process.env.RETENTION_EXPECTED_MIGRATION_DIGEST && digest !== process.env.RETENTION_EXPECTED_MIGRATION_DIGEST) throw new Error('Retention release migration history differs from the reviewed database.');
  await client.query('COMMIT');
} finally {
  await client.end();
}
