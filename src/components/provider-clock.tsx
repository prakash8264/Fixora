"use client";

import Link from "next/link";
import { Clock3, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { SectionHeader } from "./workspace-panels";
import { useWorkspace } from "@/lib/use-workspace";
import type { WorkspaceData } from "@/lib/types";
import { providerIsBusy } from "@/lib/scheduling";

export function ProviderClock({ data, compact = false }: { data: WorkspaceData; compact?: boolean }) {
  const { actor, mutation } = useWorkspace("provider");
  const provider = data.providers.find(p => p.id === actor.id);
  const clockedIn = !!provider?.clockedIn;
  const approved = provider?.status === "approved" && !provider.suspended;
  const busy = data.stats?.busy ?? providerIsBusy(data.bookings.filter(b => b.providerId === actor.id));
  return <>
    {!compact && <SectionHeader title="Your time. Your call." description="Clock in when you want new requests. Clock out when you are done — no weekly schedule to fill in."/>}
    <section aria-label="Provider clock status" className={`soft-card ${compact ? "p-5" : "max-w-2xl p-6 sm:p-8"}`}>
      <div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${clockedIn ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}><Clock3 size={23}/></span><div><p className="eyebrow mb-2 text-muted-foreground">Your availability</p><h2 className="section-heading" role="status">{clockedIn ? busy ? "Clocked in — busy with a visit" : "Clocked in — open for requests" : "Clocked out — taking a break"}</h2></div></div><Button variant={clockedIn ? "outline" : "default"} disabled={mutation.isPending || (!clockedIn && !approved)} onClick={() => mutation.mutate({ type: "clock", clockedIn: !clockedIn })}>{clockedIn ? <LogOut size={16}/> : <LogIn size={16}/>} {mutation.isPending ? "Saving…" : clockedIn ? "Clock out" : "Clock in"}</Button></div>
      <p className="mt-5 text-xs leading-[1.9] text-muted-foreground">{clockedIn ? "You can see all open requests matching your services and postal-code coverage, including requests made while you were offline." : "New requests are hidden while you are clocked out. Clock in to browse and accept matching work."} Accepted jobs, quotations, and payments stay available either way.</p>
      {!approved && <p className="mt-4 flex items-start gap-2 rounded-xl border bg-background p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={16} className="shrink-0"/>Administrator approval and an active account are required before clocking in.</p>}
      {provider?.clockChangedAt && <p className="mt-4 text-[10px] text-muted-foreground">Last {clockedIn ? "clock in" : "clock out"}: {new Date(provider.clockChangedAt).toLocaleString("en-IN",{ timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · Asia/Kolkata</p>}
      {busy && <p className="mt-4 rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">You can browse requests and accept non-conflicting future appointments. Finish your current visit before accepting another ASAP request or starting another visit. Completed work and closed inspections free availability even if payment is pending.</p>}
      {!compact && <div className="mt-6 border-t pt-5"><p className="mb-4 text-xs leading-relaxed text-muted-foreground">Check the preferred arrival time before accepting. Appointment checks use your estimated visit duration plus a 30-minute travel buffer, not a fixed morning/midday/afternoon quota. Clocking out does not cancel a commitment, and closing your browser does not automatically clock you out.</p><Link href="/provider/requests" className="rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">View service requests →</Link></div>}
    </section>
  </>;
}
