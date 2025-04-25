// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { CATEGORIES } from "../src/config/categories";

const db = new PrismaClient();

// All 43 districts of Lima Metropolitana
const LIMA_DISTRICTS = [
  "Ancón",
  "Ate",
  "Barranco",
  "Breña",
  "Carabayllo",
  "Chaclacayo",
  "Chorrillos",
  "Cieneguilla",
  "Comas",
  "El Agustino",
  "Independencia",
  "Jesús María",
  "La Molina",
  "La Victoria",
  "Lima",
  "Lince",
  "Los Olivos",
  "Lurigancho-Chosica",
  "Lurín",
  "Magdalena del Mar",
  "Miraflores",
  "Pachacámac",
  "Pucusana",
  "Pueblo Libre",
  "Puente Piedra",
  "Punta Hermosa",
  "Punta Negra",
  "Rímac",
  "San Bartolo",
  "San Borja",
  "San Isidro",
  "San Juan de Lurigancho",
  "San Juan de Miraflores",
  "San Luis",
  "San Martín de Porres",
  "San Miguel",
  "Santa Anita",
  "Santa María del Mar",
  "Santa Rosa",
  "Santiago de Surco",
  "Surquillo",
  "Villa El Salvador",
  "Villa María del Triunfo",
];

async function main() {
  // 1️⃣ Ensure categories exist
  for (const { slug, displayName } of CATEGORIES) {
    await db.category.upsert({
      where: { slug },
      update: {},
      create: { slug, displayName },
    });
  }

  // 2️⃣ Grab all categories
  const categories = await db.category.findMany();

  // 3️⃣ Seed 50 providers
  const TOTAL = 50;
  for (let i = 0; i < TOTAL; i++) {
    // Pick 1–3 related categories
    const pickCount = faker.number.int({ min: 1, max: 3 });
    const assigned = faker.helpers.arrayElements(categories, pickCount);

    await db.provider.create({
      data: {
        dni: faker.number.int({ min: 10_000_000, max: 99_999_999 }).toString(),
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName(),
        // Now restricted to Lima Metropolitana
        district: faker.helpers.arrayElement(LIMA_DISTRICTS),
        phone: `9${faker.number.int({ min: 10_000_000, max: 99_999_999 })}`,
        categories: {
          connect: assigned.map((c) => ({ id: c.id })),
        },
      },
    });
  }

  console.log(`✅ Seeded ${TOTAL} providers in Lima Metropolitana`);
}

main()
  .catch((e) => {
    console.error("🌱 Seed error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
