import "server-only";
import { ZodError } from "zod";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function parseBody(request: Request) {
  const body = await request.text();
  if (body.length > 16384) throw new ApiError(413, "Request body is too large.");
  try { return JSON.parse(body); } catch { throw new ApiError(400, "Invalid JSON request body."); }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ApiError(403, "A same-origin request is required.");
}
export function apiError(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const cause = error instanceof Error && "cause" in error ? error.cause : error;
  if (cause && typeof cause === "object" && "code" in cause && ["23505","23P01"].includes(String(cause.code))) return Response.json({ error: "This record already exists, the provider is busy, or the appointment overlaps another booking. Check the updated requests and try another arrival time." }, { status: 409 });
  console.error("Fixora API request failed", { name: error instanceof Error ? error.name : "Unknown", code: cause && typeof cause === "object" && "code" in cause ? cause.code : undefined });
  return Response.json({ error: "Unable to complete the request. Please try again." }, { status: 500 });
}
