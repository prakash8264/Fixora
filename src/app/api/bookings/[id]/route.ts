import { requireUser } from "@/lib/server/auth";
import { updateBooking } from "@/lib/server/bookings";
import { apiError, checkOrigin, parseBody } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await updateBooking(user,id,await parseBody(request)));
  } catch (error) { return apiError(error); }
}
