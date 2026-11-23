import { createClient } from '@supabase/supabase-js';

// Supabase URL and anon key should be set via VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY env vars
// These should be set in .env file, NOT committed to git
// The secret key should NEVER be put in the frontend code

// For local development, you can get these values from your Supabase dashboard
// https://supabase.com/docs/guides/getting-started/quickstart/web

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);