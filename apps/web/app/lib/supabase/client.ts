/**
 * Supabase Client
 *
 * Singleton client for Supabase Postgres database.
 * Works in both browser and Node (API routes).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[SUPABASE] Missing environment variables. Database operations will fall back to localStorage.');
}

let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Get Supabase client instance (singleton)
 * Returns null if environment variables are not configured
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

/**
 * Check if Supabase is configured and available (browser or server)
 */
export function isSupabaseAvailable(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}
