import { SignUp } from "@clerk/nextjs";
import { LiveSetup } from "@/components/live-setup";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAuthFlow } from "@/lib/auth-flow";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ intent?: string | string[] }> }) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return <LiveSetup/>;
  const flow = getAuthFlow((await searchParams).intent);
  if (flow.provider && (await auth()).userId) redirect(flow.destination);
  return <main className="grid min-h-screen place-content-center justify-items-center gap-6 p-6"><Link href="/" className="rounded-md text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">← Back to Fixora</Link>{flow.provider && <div className="max-w-sm text-center"><p className="eyebrow mb-2 text-primary">Good work starts here</p><p className="text-xs leading-relaxed text-muted-foreground">Create your account, then tell us about your services. Your application will be reviewed before you can accept requests.</p></div>}<SignUp routing="path" path="/sign-up" signInUrl={flow.signInUrl} fallbackRedirectUrl={flow.destination} forceRedirectUrl={flow.provider ? flow.destination : undefined} signInForceRedirectUrl={flow.provider ? flow.destination : undefined}/></main>;
}
