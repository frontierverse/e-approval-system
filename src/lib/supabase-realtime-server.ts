import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const globalForSupabaseRealtime = globalThis as unknown as {
  supabaseRealtimeClient?: SupabaseClient;
};

export function getSupabaseRealtimeServerClient() {
  const cachedClient = globalForSupabaseRealtime.supabaseRealtimeClient;

  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).trim();
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  ).trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required for lunch-box realtime.",
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  globalForSupabaseRealtime.supabaseRealtimeClient = client;

  return client;
}
