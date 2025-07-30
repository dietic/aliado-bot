// // prisma/seed.ts
// import { PrismaClient } from "@prisma/client";
// import { faker } from "@faker-js/faker";
// import { CATEGORIES } from "../src/config/categories";

// const db = new PrismaClient();

// // All 43 districts of Lima Metropolitana
// const LIMA_DISTRICTS = [
//   "Ancón",
//   "Ate",
//   "Barranco",
//   "Breña",
//   "Carabayllo",
//   "Chaclacayo",
//   "Chorrillos",
//   "Cieneguilla",
//   "Comas",
//   "El Agustino",
//   "Independencia",
//   "Jesús María",
//   "La Molina",
//   "La Victoria",
//   "Lima",
//   "Lince",
//   "Los Olivos",
//   "Lurigancho-Chosica",
//   "Lurín",
//   "Magdalena del Mar",
//   "Miraflores",
//   "Pachacámac",
//   "Pucusana",
//   "Pueblo Libre",
//   "Puente Piedra",
//   "Punta Hermosa",
//   "Punta Negra",
//   "Rímac",
//   "San Bartolo",
//   "San Borja",
//   "San Isidro",
//   "San Juan de Lurigancho",
//   "San Juan de Miraflores",
//   "San Luis",
//   "San Martín de Porres",
//   "San Miguel",
//   "Santa Anita",
//   "Santa María del Mar",
//   "Santa Rosa",
//   "Santiago de Surco",
//   "Surquillo",
//   "Villa El Salvador",
//   "Villa María del Triunfo",
// ];

// async function main() {
//   // 1️⃣ Ensure categories exist
//   for (const { slug, displayName } of CATEGORIES) {
//     await db.category.upsert({
//       where: { slug },
//       update: {},
//       create: { slug, displayName },
//     });
//   }

//   // 2️⃣ Grab all categories
//   const categories = await db.category.findMany();

//   // 3️⃣ Seed 50 providers
//   const TOTAL = 50;
//   for (let i = 0; i < TOTAL; i++) {
//     // Pick 1–3 related categories
//     const pickCount = faker.number.int({ min: 1, max: 3 });
//     const assigned = faker.helpers.arrayElements(categories, pickCount);

//     await db.provider.create({
//       data: {
//         dni: faker.number.int({ min: 10_000_000, max: 99_999_999 }).toString(),
//         firstName: faker.name.firstName(),
//         lastName: faker.name.lastName(),
//         // Now restricted to Lima Metropolitana
//         district: faker.helpers.arrayElement(LIMA_DISTRICTS),
//         phone: `9${faker.number.int({ min: 10_000_000, max: 99_999_999 })}`,
//         categories: {
//           connect: assigned.map((c) => ({ id: c.id })),
//         },
//       },
//     });
//   }

//   console.log(`✅ Seeded ${TOTAL} providers in Lima Metropolitana`);
// }

// main()
//   .catch((e) => {
//     console.error("🌱 Seed error:", e);
//     process.exit(1);
//   })
//   .finally(() => db.$disconnect());

// prisma/seed.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const categories = ["plumbing", "electricity", "cleaning", "carpentry"];

async function main() {
  for (let i = 1; i <= 10; i++) {
    const email = `provider${i}@test.com`;
    const password = "SecurePassword123!";
    const phone = `+5198765432${i}`;

    // 1. Create user in auth.users
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authUser?.user?.id) {
      console.error("Auth error:", authError);
      continue;
    }

    const userId = authUser.user.id;

    // 2. Insert into public.users
    await supabase.from("users").insert({
      id: userId,
      role: "provider",
      created_at: new Date().toISOString(),
    });

    // 3. Insert into providers
    await supabase.from("providers").insert({
      user_id: userId,
      dni: `1234567${i}`,
      firstName: `Test${i}`,
      lastName: `Provider${i}`,
      phone,
      rating: Math.floor(Math.random() * 3 + 3), // 3-5 stars
      createdAt: new Date().toISOString(),
    });

    // 4. Optionally add some categories or districts
    const providerIdRes = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", userId)
      .single();

    const providerId = providerIdRes.data?.id;
    if (providerId) {
      // random category
      const categoryName =
        categories[Math.floor(Math.random() * categories.length)];
      const catRes = await supabase
        .from("categories")
        .select("id")
        .eq("slug", categoryName)
        .maybeSingle();
      if (catRes.data?.id) {
        await supabase.from("provider_categories").insert({
          provider_id: providerId,
          category_id: catRes.data.id,
        });
      }
    }

    console.log(`Seeded provider ${email}`);
  }
}

main();
