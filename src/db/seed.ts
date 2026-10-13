import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "dotenv";
import { createDemoState } from "../lib/demo/seed";
import { serviceCategories, services } from "./schema";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env.local before seeding.");
  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  const db = drizzle(client);
  try {
    await db.transaction(async tx => {
      const catalog = createDemoState().services;
      for (const name of new Set(catalog.map(s => s.category))) {
        const slug = name.toLowerCase().replaceAll(" ", "-");
        const [category] = await tx.insert(serviceCategories).values({ name, slug }).onConflictDoUpdate({ target: serviceCategories.slug, set: { name } }).returning();
        for (const s of catalog.filter(s => s.category === name)) {
          await tx.insert(services).values({ categoryId: category.id, slug: s.id, name: s.name, description: s.description, basePrice: s.price, icon: s.icon, color: s.color }).onConflictDoNothing({ target: services.slug });
        }
      }
    });
    console.log("Service catalog seeded. No demo identities, bookings, or fake payments were inserted.");
  } finally { await client.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
