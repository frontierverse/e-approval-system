import 'dotenv/config';
import { Client } from 'pg';

const secret = process.env.CRON_SECRET?.trim();
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!secret || !connectionString) throw Error('DATABASE_URL and CRON_SECRET are required.');
const active = process.argv.includes('--activate');
const name = 'bajaul-employee-push-dispatch';
const secretName = 'bajaul_mobile_push_cron_secret';
const db = new Client({ connectionString });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
  await db.query('CREATE EXTENSION IF NOT EXISTS pg_net');
  const privileges = await db.query("SELECT has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT') AS anon, has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') AS authenticated");
  if (privileges.rows.some(row => row.anon || row.authenticated)) throw Error('Vault is readable by application roles; secure Vault access before storing a scheduler secret.');
  const found = await db.query('SELECT id FROM vault.secrets WHERE name=$1', [secretName]);
  if (found.rows.length) await db.query('SELECT vault.update_secret($1::uuid,$2,$3)', [found.rows[0].id, secret, secretName]);
  else await db.query('SELECT vault.create_secret($1,$2,$3)', [secret, secretName, 'Employee push scheduler authentication']);
  // Only the Vault reference is stored in cron.job; never store a raw secret in job SQL.
  const command = `SELECT net.http_get(
    url := 'https://www.bajaul.com/api/mobile/push-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${secretName}')),
    timeout_milliseconds := 60000
  );`;
  const job = await db.query('SELECT cron.schedule($1,$2,$3) AS id', [name, '*/15 * * * *', command]);
  await db.query('UPDATE cron.job SET active=$1 WHERE jobid=$2', [active, job.rows[0].id]);
  await db.query('COMMIT');
  console.log(JSON.stringify({ jobId: job.rows[0].id, name, active, intervalMinutes: 15 }));
} catch (error) {
  await db.query('ROLLBACK');
  // Do not echo SQL parameter values or database credentials on failures.
  console.error(error instanceof Error ? error.message : 'Scheduler configuration failed');
  process.exitCode = 1;
} finally { await db.end(); }
