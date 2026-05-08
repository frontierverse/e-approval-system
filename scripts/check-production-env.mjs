import "dotenv/config";

const requiredChecks = [
  checkDatabaseUrl,
  checkAuthSecret,
  checkAttachmentStorage,
];

const optionalWarnings = [
  checkInitialAdmin,
];

let failed = false;

for (const check of requiredChecks) {
  const result = check();
  report(result);

  if (!result.ok) {
    failed = true;
  }
}

for (const check of optionalWarnings) {
  report(check());
}

if (failed) {
  console.error("\nProduction environment check failed.");
  process.exit(1);
}

console.log("\nProduction environment check passed.");

function checkDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (!databaseUrl) {
    return fail("DATABASE_URL", "DATABASE_URL is required.");
  }

  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    return fail(
      "DATABASE_URL",
      "Production DATABASE_URL must use PostgreSQL, for example postgresql://...",
    );
  }

  if (/^file:/.test(databaseUrl)) {
    return fail("DATABASE_URL", "SQLite file URLs are not valid for production.");
  }

  if (/(USER|PASSWORD|HOST|DATABASE)/.test(databaseUrl)) {
    return fail(
      "DATABASE_URL",
      "DATABASE_URL still looks like the placeholder value.",
    );
  }

  return pass("DATABASE_URL", "PostgreSQL URL is present.");
}

function checkAuthSecret() {
  const authSecret = process.env.AUTH_SECRET ?? "";

  if (!authSecret) {
    return fail("AUTH_SECRET", "AUTH_SECRET is required.");
  }

  if (
    authSecret === "replace-with-a-long-random-secret" ||
    authSecret === "local-dev-gyeoljaeon-auth-secret-change-before-production"
  ) {
    return fail("AUTH_SECRET", "AUTH_SECRET still uses a placeholder value.");
  }

  if (authSecret.length < 32) {
    return fail("AUTH_SECRET", "AUTH_SECRET should be at least 32 characters.");
  }

  return pass("AUTH_SECRET", "Session secret looks usable.");
}

function checkAttachmentStorage() {
  const driver = process.env.ATTACHMENT_STORAGE_DRIVER ?? "";

  if (driver === "supabase-storage") {
    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
      return fail(
        "SUPABASE_URL",
        "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required for Supabase Storage.",
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return fail(
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY is required for Supabase Storage attachment storage.",
      );
    }

    if (!process.env.SUPABASE_STORAGE_BUCKET) {
      return fail(
        "SUPABASE_STORAGE_BUCKET",
        "SUPABASE_STORAGE_BUCKET is required for Supabase Storage attachment storage.",
      );
    }

    return pass("ATTACHMENT_STORAGE", "Supabase Storage is configured.");
  }

  if (driver !== "vercel-blob") {
    return fail(
      "ATTACHMENT_STORAGE_DRIVER",
      "Production attachments must use ATTACHMENT_STORAGE_DRIVER=supabase-storage or vercel-blob.",
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return fail(
      "BLOB_READ_WRITE_TOKEN",
      "BLOB_READ_WRITE_TOKEN is required for Vercel Blob attachment storage.",
    );
  }

  return pass("ATTACHMENT_STORAGE", "Vercel Blob storage is configured.");
}

function checkInitialAdmin() {
  if (process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
    return pass("INITIAL_ADMIN", "Initial admin values are present.");
  }

  return warn(
    "INITIAL_ADMIN",
    "Initial admin creation is not automated yet. Follow docs/deployment.md.",
  );
}

function pass(name, message) {
  return { level: "pass", ok: true, name, message };
}

function warn(name, message) {
  return { level: "warn", ok: true, name, message };
}

function fail(name, message) {
  return { level: "fail", ok: false, name, message };
}

function report(result) {
  const prefix = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL",
  }[result.level];

  const logger = result.level === "fail" ? console.error : console.log;
  logger(`${prefix} ${result.name}: ${result.message}`);
}
