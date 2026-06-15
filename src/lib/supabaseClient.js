import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    };
