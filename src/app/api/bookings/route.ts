import { requireUser } from "@/lib/server/auth";
import { createBooking } from "@/lib/server/bookings";
import { apiError, checkOrigin, parseBody } from "@/lib/server/http";
import { getWorkspace } from "@/lib/server/workspace";
import { parseWorkspaceOptions } from "@/lib/pagination";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    params.set("section","bookings"); params.delete("bookingId");
    const data = await getWorkspace(user,parseWorkspaceOptions(params));
    return Response.json({ items: data.bookings, pagination: data.pages?.bookings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser("customer");
    const booking = await createBooking(user,await parseBody(request),request.headers.get("idempotency-key") ?? "");
    return Response.json(booking, { status: 201 });
  } catch (error) { return apiError(error); }
}
