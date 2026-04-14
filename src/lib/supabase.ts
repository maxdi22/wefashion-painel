import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail-safe validation to prevent startup crashes on Vercel
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] CRITICAL: SUPABASE_URL or SUPABASE_ANON_KEY is missing in environment variables.');
}

// Cliente público para operações básicas
// Usamos fallback de string vazia para o construtor, mas o log acima avisará o desenvolvedor
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Cliente Admin para operações que exigem bypass de RLS
export const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
