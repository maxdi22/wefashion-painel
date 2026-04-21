
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const profiles = await prisma.profile.findMany();
  console.log('--- PROFILES ---');
  console.log(JSON.stringify(profiles, null, 2));

  const tenants = await prisma.tenant.findMany();
  console.log('--- TENANTS ---');
  console.log(JSON.stringify(tenants, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
