import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Cliente público para operações básicas
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente Admin para operações que exigem bypass de RLS (ex: seeding, gerenciamento de tenants)
// IMPORTANTE: Use apenas no backend em funções seguras.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
