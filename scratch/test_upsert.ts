
import { prisma } from '../src/lib/prisma';
import crypto from 'crypto';

async function testUpsert() {
  const testId = 'test-user-' + crypto.randomBytes(4).toString('hex');
  const testEmail = `test-${testId}@example.com`;

  console.log(`--- Testando Upsert para ID: ${testId} ---`);

  // 1. Simular o Trigger: Criar perfil antes
  console.log('1. Simulando trigger (criando perfil inicial)...');
  await prisma.profile.create({
    data: {
      id: testId,
      email: testEmail,
      role: 'ADMIN_LOJA', // Role padrão do trigger
      updatedAt: new Date()
    }
  });

  // 2. Tentar o Upsert (que é o que o controlador agora faz)
  console.log('2. Executando UPSERT (lógica do controlador)...');
  
  // Criar um tenant fake para o teste
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Tenant Teste Upsert',
      domain: 'test.com',
      installToken: 'token-' + testId,
      publicKey: 'pk-' + testId,
      secretKey: 'sk-' + testId,
    }
  });

  try {
    const upsertedProfile = await prisma.profile.upsert({
      where: { id: testId },
      update: {
        tenantId: tenant.id,
        role: 'tenant_admin'
      },
      create: {
        id: testId,
        email: testEmail,
        role: 'tenant_admin',
        tenantId: tenant.id
      }
    });

    console.log('✅ Upsert concluído com sucesso!');
    console.log('Dados do perfil:', upsertedProfile);

    if (upsertedProfile.tenantId === tenant.id && upsertedProfile.role === 'tenant_admin') {
      console.log('✨ Validação de dados: SUCESSO');
    } else {
      console.log('❌ Validação de dados: FALHA');
    }

  } catch (error) {
    console.error('❌ Erro no Upsert:', error);
  } finally {
    // Limpeza
    console.log('3. Limpando dados de teste...');
    await prisma.profile.delete({ where: { id: testId } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

testUpsert().catch(console.error);
