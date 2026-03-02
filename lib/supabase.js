import { createClient } from '@supabase/supabase-js';

// Cliente con service_role para escritura (scripts de ingesta)
export function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Cliente con anon key para lectura (webhook)
export function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
