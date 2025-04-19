import { PrismaClient, ServiceCategory } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  await db.provider.createMany({
    data: [
      {
        dni: "12345678",
        firstName: "Juan",
        lastName: "Plomero",
        district: "miraflores",
        phone: "+51987654321",
        categories: [ServiceCategory.PLOMERIA],
      },
    ],
    skipDuplicates: true,
  });
}
main().finally(() => db.$disconnect());
