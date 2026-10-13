import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/server/auth";
import { apiError, checkOrigin, parseBody } from "@/lib/server/http";
import { getWorkspace } from "@/lib/server/workspace";
import { parseWorkspaceOptions } from "@/lib/pagination";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    params.set("section","notifications"); params.delete("bookingId");
    const data = await getWorkspace(await requireUser(),parseWorkspaceOptions(params));
    return Response.json({ items: data.notifications, pagination: data.pages?.notifications, unread: data.stats?.unread },{ headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); const { id } = z.object({ id: z.uuid().optional() }).parse(await parseBody(request));
    await getDb().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.recipientId,user.id),id ? eq(notifications.id,id) : undefined));
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
