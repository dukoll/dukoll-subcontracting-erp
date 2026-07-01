import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the SERVICE ROLE key. Never import this
 * from client components — the service key must stay on the server.
 * Requires the SUPABASE_SERVICE_ROLE_KEY environment variable.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SERVICE_KEY_MISSING');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
