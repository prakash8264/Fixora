import Link from "next/link";
import { HouseHeart, ShieldCheck } from "lucide-react";

export function LiveSetup() {
  return <main className="grid min-h-screen place-items-center p-6"><div className="soft-card max-w-lg p-8"><HouseHeart className="mb-5 text-primary" size={36}/><h1 className="page-heading">Finish connecting Fixora.</h1><p className="mt-4 text-sm leading-relaxed text-muted-foreground">Configure Clerk and DATABASE_URL in .env or .env.local, apply the database migrations, and restart the application.</p><div className="my-5 flex items-start gap-2 rounded-xl bg-accent p-4 text-xs leading-relaxed text-primary"><ShieldCheck size={18} className="shrink-0"/>Demo role switching and simulated payments are intentionally unavailable in live mode.</div><p className="text-xs leading-relaxed text-muted-foreground">Set NEXT_PUBLIC_APP_MODE=demo to preview the application. See README.md for setup instructions.</p>{process.env.NEXT_PUBLIC_APP_MODE === "live" && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && <Link href="/sign-in" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-white">Sign in with Clerk</Link>}</div></main>;
}
