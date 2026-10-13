"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { ServiceIcon } from "./service-icon";
import { money } from "@/lib/domain";
import { availabilityLabels, requestAvailability, scheduleLabel } from "@/lib/scheduling";
import { useWorkspace } from "@/lib/use-workspace";
import type { RequestPreview, WorkspaceData } from "@/lib/types";

export function ServiceRequestCard({ request: b, data }: { request: RequestPreview; data: WorkspaceData }) {
  const { actor, mutation } = useWorkspace("provider");
  const [arrivalMinutes, setArrivalMinutes] = useState(30);
  const [visitMinutes, setVisitMinutes] = useState(b.visitMinutes ?? 60);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()),30000); return () => clearInterval(timer); },[]);
  const local = requestAvailability(b,data.reservations ?? data.bookings.filter(job => job.providerId === actor.id),now,arrivalMinutes,visitMinutes);
  const availability = data.reservations ? local : b.availability !== "available" ? b.availability : local;
  return <article className="soft-card space-y-4 p-6"><ServiceIcon service={data.services.find(s => s.id === b.serviceId)}/><h2 className="text-lg font-bold">{data.services.find(s => s.id === b.serviceId)?.name}</h2><p className="text-xs text-muted-foreground">{b.reference}</p>
    <p className="flex items-center gap-2 text-xs"><MapPin size={14}/>{b.city} · {b.postalCode}</p><p className="flex items-start gap-2 text-xs leading-relaxed"><CalendarDays size={14} className="shrink-0"/>{scheduleLabel(b)}</p>
    <p className={`rounded-xl border p-3 text-[11px] leading-relaxed ${availability === "available" ? "bg-accent text-primary" : "bg-background text-muted-foreground"}`} role="status">{availabilityLabels[availability]}</p>
    <p className="text-[11px] leading-relaxed text-muted-foreground">{b.description}</p><p className="text-sm font-semibold">{b.paymentRule === 2 ? "Visit / inspection fee" : "Base price (original terms)"} · {money(b.basePrice)}</p>
    {b.scheduleMode === "asap" && <div className="space-y-2"><Label htmlFor={`eta-${b.id}`}>Your estimated arrival</Label><select id={`eta-${b.id}`} className="h-11 w-full rounded-lg border bg-background px-3 text-xs" value={arrivalMinutes} onChange={e => setArrivalMinutes(Number(e.target.value))}>{[15,30,60,120].map(n => <option key={n} value={n}>Within about {n} minutes</option>)}</select></div>}
    <div className="space-y-2"><Label htmlFor={`duration-${b.id}`}>Estimated visit duration</Label><select id={`duration-${b.id}`} className="h-11 w-full rounded-lg border bg-background px-3 text-xs" value={visitMinutes} onChange={e => setVisitMinutes(Number(e.target.value))}>{[60,120,180,240,480].map(n => <option key={n} value={n}>{n / 60} {n === 60 ? "hour" : "hours"} + 30-minute travel buffer</option>)}</select><p className="text-[10px] leading-relaxed text-muted-foreground">Allow enough time for the expected visit. This estimate does not approve work or extra charges.</p></div>
    <div className="flex gap-2"><Button disabled={mutation.isPending || availability !== "available"} onClick={() => mutation.mutate({ type: "accept", bookingId: b.id, arrivalMinutes, visitMinutes })}>Accept request</Button><Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "decline", bookingId: b.id })}>Decline</Button></div>
  </article>;
}
