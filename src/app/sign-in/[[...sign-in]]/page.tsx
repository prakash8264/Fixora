import { SignIn } from "@clerk/nextjs";
import { LiveSetup } from "@/components/live-setup";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAuthFlow } from "@/lib/auth-flow";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ intent?: string | string[] }> }) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return <LiveSetup/>;
  const flow = getAuthFlow((await searchParams).intent);
  if (flow.provider && (await auth()).userId) redirect(flow.destination);
  return <main className="grid min-h-screen place-content-center justify-items-center gap-6 p-6"><Link href="/" className="rounded-md text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">← Back to Fixora</Link>{flow.provider && <div className="max-w-sm text-center"><p className="eyebrow mb-2 text-primary">Join Fixora as a provider</p><p className="text-xs leading-relaxed text-muted-foreground">Sign in to complete your provider application. You do not need to book a customer service first.</p></div>}<SignIn routing="path" path="/sign-in" signUpUrl={flow.signUpUrl} fallbackRedirectUrl={flow.destination} forceRedirectUrl={flow.provider ? flow.destination : undefined} signUpForceRedirectUrl={flow.provider ? flow.destination : undefined}/></main>;
}
