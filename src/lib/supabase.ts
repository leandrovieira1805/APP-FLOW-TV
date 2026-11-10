import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://sifllowuedmwexkqqpgv.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_eIal7uFrndU1hDsxcQaL7Q_hY0dsR-r";

export const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export let supabase: any = null;
if (useSupabase) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
