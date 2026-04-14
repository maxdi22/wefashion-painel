import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey || supabaseServiceKey === 'placeholder_for_service_role') {
  console.error('ERRO: SUPABASE_SERVICE_ROLE_KEY não configurada no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log('--- Iniciando Seeding de Usuários ---');

  // 1. Criar SuperAdmin
  const { data: superAdmin, error: superError } = await supabase.auth.admin.createUser({
    email: 'maxdi.agency@gmail.com',
    password: 'password123', // MUDAR APÓS PRIMEIRO LOGIN
    email_confirm: true,
    user_metadata: { role: 'SUPERADMIN' }
  });

  if (superError) {
    if (superError.message.includes('already registered')) {
      console.log('✔ SuperAdmin já cadastrado.');
    } else {
      console.error('✖ Erro ao criar SuperAdmin:', superError.message);
    }
  } else {
    console.log('✔ SuperAdmin criado com sucesso!');
    // O trigger handle_new_user deve criar o perfil automaticamente. 
    // Vamos apenas garantir a role correta via meta se necessário, 
    // mas o ideal é atualizar a tabela profiles manualmente para SUPERADMIN.
    await supabase
      .from('profiles')
      .update({ role: 'SUPERADMIN' })
      .eq('id', superAdmin.user.id);
  }

  // 2. Criar Admin de Loja (Tenant)
  const tenantId = '2ff41466-8f57-49e5-956c-27a16ba9aa6b'; // ID da Loja Teste que criamos via SQL

  const { data: tenantAdmin, error: tenantError } = await supabase.auth.admin.createUser({
    email: 'loja-test@example.com',
    password: 'password123',
    email_confirm: true,
    user_metadata: { role: 'ADMIN_LOJA' }
  });

  if (tenantError) {
    if (tenantError.message.includes('already registered')) {
      console.log('✔ Admin de Loja já cadastrado.');
    } else {
      console.error('✖ Erro ao criar Admin de Loja:', tenantError.message);
    }
  } else {
    console.log('✔ Admin de Loja criado com sucesso!');
    // Associar ao tenant no perfil
    await supabase
      .from('profiles')
      .update({ role: 'ADMIN_LOJA', tenant_id: tenantId })
      .eq('id', tenantAdmin.user.id);
  }

  console.log('--- Seeding Finalizado ---');
}

seed();
