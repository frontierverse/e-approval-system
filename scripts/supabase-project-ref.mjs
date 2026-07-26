export function getSupabaseProjectRefFromProjectUrl(value) {
  const parsedUrl = parseUrl(value);
  const match = parsedUrl?.hostname
    .toLowerCase()
    .match(/^([a-z0-9]+)\.supabase\.co$/);

  return match?.[1] ?? null;
}

export function getSupabaseProjectRefFromDatabaseUrl(value) {
  const parsedUrl = parseUrl(value);

  if (!parsedUrl) {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const directHostMatch = hostname.match(
    /^db\.([a-z0-9]+)\.supabase\.co$/,
  );

  if (directHostMatch) {
    return directHostMatch[1];
  }

  if (!hostname.endsWith(".pooler.supabase.com")) {
    return null;
  }

  const username = safelyDecodeURIComponent(parsedUrl.username);
  const poolerUsernameMatch = username.match(/^postgres\.([a-z0-9]+)$/);

  return poolerUsernameMatch?.[1] ?? null;
}

function parseUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safelyDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
