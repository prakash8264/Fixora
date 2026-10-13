import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const clerkId = process.argv[2];
  if (!clerkId?.startsWith("user_") || !process.argv.includes("--confirm")) throw new Error("Usage: npm run admin:grant -- user_YOUR_CLERK_ID --confirm");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const client = postgres(process.env.DATABASE_URL,{ prepare: false, max: 1 });
  try {
    await client.begin(async tx => {
      const [user] = await tx`select id, role from users where clerk_user_id = ${clerkId} and suspended = false for update`;
      if (!user) throw new Error("Sign in to Fixora with that Clerk account first. Suspended accounts cannot be promoted.");
      const [activity] = await tx`select id from bookings where customer_id = ${user.id} or provider_id = ${user.id} limit 1`;
      if (activity || user.role === "provider") throw new Error("Use a dedicated administrator account with no customer/provider booking history.");
      await tx`update users set role = 'admin', updated_at = now() where id = ${user.id}`;
      console.log("Administrator role granted. Sign out and sign back in to load the administrator workspace.");
    });
  } finally { await client.end(); }
}
main().catch(error => { console.error(error instanceof Error && !('query' in error) ? error.message : "Admin setup failed."); process.exitCode = 1; });
