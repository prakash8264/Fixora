import { requireUser } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export async function GET() { try { return Response.json(await requireUser(), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); } }
