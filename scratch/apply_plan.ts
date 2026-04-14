import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log('--- TENANTS ---');
  tenants.forEach(t => {
    console.log(`ID: ${t.id} | Nome: ${t.name} | Plano: ${t.plan} | Provas: ${t.proofsUsedThisMonth}/${t.proofsMonthlyLimit} | Saldo: ${t.proofsBalance}`);
  });
  
  // Atualizar o tenant do usuário (provavelmente o único ou o com ID conhecido)
  const targetId = '2ff41466-8f57-49e5-956c-27a16ba9aa6b';
  const tenantExist = tenants.find(t => t.id === targetId);

  if (tenantExist) {
    await prisma.tenant.update({
      where: { id: targetId },
      data: {
        plan: 'Growth',
        proofsMonthlyLimit: 150,
        proofsUsedThisMonth: 0,
        proofsBalance: 50, // Bônus de recarga para teste
        subscriptionStatus: 'active'
      }
    });
    console.log(`\n✅ Plano Growth aplicado ao tenant ${targetId}`);
  } else if (tenants.length > 0) {
    // Se não for esse ID, pegar o primeiro para garantir que o usuário consiga testar
    const first = tenants[0];
     await prisma.tenant.update({
      where: { id: first.id },
      data: {
        plan: 'Growth',
        proofsMonthlyLimit: 150,
        proofsUsedThisMonth: 0,
        proofsBalance: 50,
        subscriptionStatus: 'active'
      }
    });
     console.log(`\n✅ Plano Growth aplicado ao tenant ${first.id} (${first.name})`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
