import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const job = await prisma.tryOnJob.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(job, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
