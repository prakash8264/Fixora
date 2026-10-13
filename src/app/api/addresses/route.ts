import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { addresses, users } from "@/db/schema";
import { addressSchema } from "@/lib/domain";
import { requireUser } from "@/lib/server/auth";
import { ApiError, apiError, checkOrigin, parseBody } from "@/lib/server/http";

export async function GET() {
  try { const user = await requireUser("customer"); return Response.json(await getDb().select().from(addresses).where(eq(addresses.customerId,user.id)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser("customer"); const values = addressSchema.parse(await parseBody(request));
    const address = await getDb().transaction(async tx => {
      const [account] = await tx.select().from(users).where(eq(users.id,user.id)).for("no key update");
      if (!account || account.suspended || account.role !== "customer") throw new ApiError(403,"This customer account is unavailable.");
      const existing = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.customerId,user.id)).limit(1);
      const [row] = await tx.insert(addresses).values({ ...values, customerId: user.id, isDefault: !existing.length }).returning(); return row;
    });
    return Response.json(address, { status: 201 });
  } catch (error) { return apiError(error); }
}
