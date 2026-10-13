import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiError } from "./http";
import type { Role } from "../domain";

export async function requireUser(role?: Role) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") throw new ApiError(503, "Live API is disabled in demo mode.");
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new ApiError(503, "Live database and authentication are not configured.");
  const { userId } = await auth();
  if (!userId) throw new ApiError(401, "Sign in to continue.");
  const db = getDb();
  let [user] = await db.select().from(users).where(eq(users.clerkUserId,userId)).limit(1);
  if (!user) {
    const clerk = await currentUser();
    if (!clerk) throw new ApiError(401, "Sign in to continue.");
    const email = clerk.emailAddresses.find(e => e.id === clerk.primaryEmailAddressId)?.emailAddress;
    if (!email) throw new ApiError(400, "A primary email address is required.");
    await db.insert(users).values({ clerkUserId: userId, name: [clerk.firstName,clerk.lastName].filter(Boolean).join(" ") || "Fixora customer", email, role: "customer" }).onConflictDoNothing({ target: users.clerkUserId });
    [user] = await db.select().from(users).where(eq(users.clerkUserId,userId)).limit(1);
  }
  if (!user || user.suspended) throw new ApiError(403, "This account is unavailable.");
  if (role && user.role !== role) throw new ApiError(403, "Your account cannot perform this action.");
  return user;
}
