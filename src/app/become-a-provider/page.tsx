import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { CalendarDays, HouseHeart, ShieldCheck, Wrench } from "lucide-react";
import { LiveSetup } from "@/components/live-setup";
import { ProviderApplication } from "@/components/live-panels";
import { WorkspaceSessionProvider } from "@/components/workspace-session";
import { requireUser } from "@/lib/server/auth";
import { getWorkspace } from "@/lib/server/workspace";
import { ApiError } from "@/lib/server/http";
import { getAuthFlow } from "@/lib/auth-flow";

export default async function ProviderOnboardingPage() {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") redirect("/provider");
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <LiveSetup/>;
  if (!(await auth()).userId) redirect(getAuthFlow("provider").signUpUrl);
  let user;
  try { user = await requireUser(); }
  catch (error) { if (error instanceof ApiError && error.status === 403) redirect("/customer"); throw error; }
  if (user.role !== "customer") redirect(`/${user.role}`);
  const data = await getWorkspace(user);

  return <WorkspaceSessionProvider actor={{ id: user.id, role: user.role }}>
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
      <header className="mb-12 flex items-center justify-between gap-4"><Link href="/" className="flex items-center gap-2 rounded-md text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"><HouseHeart className="text-primary" size={26}/>fixora<span className="-ml-2 text-primary">.</span></Link><div className="flex items-center gap-3"><span className="text-[10px] text-muted-foreground">Your account</span><UserButton/></div></header>
      <main className="grid gap-8 pb-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div><p className="eyebrow mb-3 text-primary">Good work starts here</p><h1 className="page-heading">Put your skills<br/>to good use<span className="text-primary">.</span></h1><p className="mt-5 max-w-sm text-sm leading-[1.9] text-muted-foreground">Tell us about your work and the neighbourhoods you serve. Join the hands behind a happier home.</p><ol className="mt-8 space-y-6">{[{ icon: Wrench, title: "Complete your application", text: "Choose your services and postal-code coverage." },{ icon: ShieldCheck, title: "Wait for administrator approval", text: "Your account stays pending until your profile is reviewed." },{ icon: CalendarDays, title: "Make room for good work", text: "Clock in after approval to browse matching ASAP and scheduled requests." }].map((step,i) => <li key={step.title} className="flex items-start gap-3"><span className="soft-inset grid size-10 shrink-0 place-items-center text-primary"><step.icon size={18}/></span><div><p className="text-xs font-semibold">{i+1}. {step.title}</p><p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{step.text}</p></div></li>)}</ol><Link href="/" className="mt-8 inline-block rounded-md text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">← Back to Fixora</Link></div>
        {data.bookings.length ? <div className="soft-card h-fit space-y-4 p-7"><h2 className="section-heading">Use a separate provider account.</h2><p className="text-xs leading-[1.9] text-muted-foreground">This account already has customer booking history, so it cannot be converted into a provider account. Sign out using the account menu, then return here to register with another email or Google account.</p><Link href="/customer" className="inline-block rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Return to your customer dashboard →</Link></div> : <ProviderApplication data={data} role="customer" onboarding/>}
      </main>
    </div>
  </WorkspaceSessionProvider>;
}
