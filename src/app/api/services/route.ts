import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { services, serviceCategories } from "@/db/schema";
import { requireUser } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export async function GET() {
  try {
    await requireUser();
    const rows = await getDb().select({ id: services.id, name: services.name, category: serviceCategories.name, description: services.description, price: services.basePrice, icon: services.icon, color: services.color }).from(services).innerJoin(serviceCategories,eq(services.categoryId,serviceCategories.id)).where(and(eq(services.active,true),eq(serviceCategories.active,true)));
    return Response.json(rows);
  } catch (error) { return apiError(error); }
}
