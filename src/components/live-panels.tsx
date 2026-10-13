"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CreditCard, ShieldCheck, Star } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { AddressesPanel, Empty, SectionHeader } from "./workspace-panels";
import { useWorkspace } from "@/lib/use-workspace";
import { dateLabel, isPayable, money, type Role } from "@/lib/domain";
import type { Booking, Provider, WorkspaceData } from "@/lib/types";
import { ProviderClock } from "./provider-clock";
import { ServiceRequestCard } from "./service-request-card";
import { ListPagination } from "./list-pagination";

export function LiveRequestsPanel({ data }: { data: WorkspaceData }) {
  return <><SectionHeader title="Good work, close to home" description="All open requests matching your services and postal-code coverage."/><div className="mb-6"><ProviderClock data={data} compact/></div>
    <p className="mb-6 rounded-xl border bg-accent/60 p-4 text-xs leading-relaxed text-primary">Exact addresses and private issue details are shared only after assignment. The first eligible acceptance wins.</p>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.requests?.map(b => <ServiceRequestCard key={b.id} request={b} data={data}/>)}</div><ListPagination info={data.pages?.requests} label="service requests"/>{!data.requests?.length && <Empty title="A little breathing room" description="Clock in after approval to see open requests matching your services and postal-code coverage. Conflicting or expired requests stay visible with an explanation."/>}</>;
}

export function LiveAddressesPanel({ data }: { data: WorkspaceData }) {
  const { mutation } = useWorkspace("customer");
  return <><AddressesPanel data={data}/>{data.addresses.length > 1 && <div className="surface-panel mt-6 max-w-xl space-y-3 p-5"><Label htmlFor="default-address">Default booking address</Label><select id="default-address" className="h-11 w-full rounded-lg border bg-background px-3 text-xs" value={data.addresses[0].id} disabled={mutation.isPending} onChange={e => mutation.mutate({ type: "default-address", id: e.target.value })}>{data.addresses.map(a => <option key={a.id} value={a.id}>{a.label} · {a.city}</option>)}</select></div>}</>;
}

export function LivePaymentsPanel({ data, role, onBooking }: { data: WorkspaceData; role: Role; onBooking: (booking: Booking) => void }) {
  const unpaid = data.bookings.filter(b => data.pages?.unpaid?.ids ? data.pages.unpaid.ids.includes(b.id) : isPayable(b.status) && b.payment === "unpaid");
  return <><SectionHeader title={role === "provider" ? "Your work, your earnings" : "Payments, made clear"} description="Server-verified Razorpay Test Mode records. No provider payouts or automated refunds."/>
    <div className="mb-6 grid gap-5 sm:grid-cols-3">{[["Captured total",money(data.stats?.collected ?? data.payments.reduce((sum,p) => sum+p.amount,0))],["Payments",data.stats?.payments ?? data.payments.length],["Awaiting payment",data.stats?.unpaid ?? unpaid.length]].map(([label,value]) => <div key={label} className="soft-card p-6"><CreditCard className="mb-3 text-primary" size={22}/><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
    {!data.webhookEnabled && role === "customer" && <p className="mb-6 rounded-xl border bg-accent/60 p-4 text-xs leading-relaxed text-primary">Webhooks are not configured. If checkout was interrupted, open the booking and use Check payment status before retrying.</p>}
    <h2 className="section-heading mb-4">Awaiting payment</h2>{unpaid.map(b => <Button key={b.id} className="mb-3 mr-3" variant="outline" onClick={() => onBooking(b)}>{b.reference} · {money(b.total)}</Button>)}
    <ListPagination info={data.pages?.unpaid} label="unpaid bookings" pageKey="pendingPage"/>
    <h2 className="section-heading my-5">Payment history</h2><div className="soft-card overflow-hidden">{data.payments.map(p => { const b = data.bookings.find(b => b.id === p.bookingId); return b && <button key={p.id} onClick={() => onBooking(b)} className="flex w-full flex-wrap items-center justify-between gap-4 border-b p-5 text-left last:border-b-0"><span className="text-xs"><strong>{b.reference}</strong><span className="mt-1 block break-all text-[10px] text-muted-foreground">{p.id} · {dateLabel(p.createdAt.slice(0,10))}</span></span><span className="text-sm font-semibold">{money(p.amount)} <span className="ml-2 text-[10px] text-primary">Captured</span></span></button>; })}</div>
    <ListPagination info={data.pages?.payments} label="payments"/>{!data.payments.length && <Empty title="No payments yet" description="Captured payments appear after completed work or a declined inspection quotation is paid."/>}</>;
}

export function LiveReviewsPanel({ data, role, onBooking }: { data: WorkspaceData; role: Role; onBooking: (booking: Booking) => void }) {
  const pending = data.bookings.filter(b => data.pages?.pendingReviews?.ids ? data.pages.pendingReviews.ids.includes(b.id) : b.status === "completed" && b.payment === "captured" && !data.reviews.some(r => r.bookingId === b.id));
  return <><SectionHeader title="A little appreciation" description="Verified feedback from completed, paid bookings."/>
    {role === "customer" && pending.map(b => <Button variant="outline" key={b.id} className="mb-5 mr-3" onClick={() => onBooking(b)}>Review {b.reference}</Button>)}
    {role === "customer" && <ListPagination info={data.pages?.pendingReviews} label="visits awaiting a review" pageKey="pendingPage"/>}
    <div className="grid gap-5 md:grid-cols-2">{data.reviews.map(r => <div className="soft-card p-6" key={r.id}><div aria-label={`${r.rating} out of 5 stars`} className="mb-4 flex gap-1">{[1,2,3,4,5].map(n => <Star key={n} size={16} className={n <= r.rating ? "fill-amber-500 text-amber-500" : "text-border"}/>)}</div><p className="text-sm leading-relaxed">{r.comment || "A little rating, a lot of appreciation."}</p><p className="mt-4 text-xs text-muted-foreground">{data.bookings.find(b => b.id === r.bookingId)?.reference}</p></div>)}</div><ListPagination info={data.pages?.reviews} label="reviews"/>{!data.reviews.length && <Empty title="Your story starts here" description="Reviews become available after a completed, paid service."/>}</>;
}

function ProviderCard({ provider: p, data }: { provider: Provider; data: WorkspaceData }) {
  const { mutation } = useWorkspace("admin");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return <div className="soft-card space-y-4 p-6"><div className="flex items-center justify-between"><div className="grid size-12 place-items-center rounded-xl bg-accent font-semibold text-primary">{p.initials}</div><span className="text-xs capitalize text-primary">{p.status}{p.suspended && " · Suspended"}</span></div><h2 className="text-base font-bold">{p.name}</h2><p className="text-xs leading-relaxed text-muted-foreground">{p.bio}</p><p className="text-xs">{p.experienceYears ?? 0} years of experience</p><p className="text-xs leading-relaxed">{p.services.map(id => data.services.find(s => s.id === id)?.name).join(", ")}</p><p className="text-xs text-muted-foreground">Service areas: {p.areas.join(", ")}</p>
    {p.status === "pending" ? <><div className="flex gap-2 border-t pt-4"><Button disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "provider-status", providerId: p.id, status: "approved" })}><Check size={14}/>Approve</Button><Button variant="outline" onClick={() => setRejecting(v => !v)}>Reject</Button></div>{rejecting && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); try { await mutation.mutateAsync({ type: "provider-status", providerId: p.id, status: "rejected", reason }); setRejecting(false); } catch {} }}><Label htmlFor={`rejection-${p.id}`}>Rejection reason</Label><Textarea required minLength={3} maxLength={300} id={`rejection-${p.id}`} value={reason} onChange={e => setReason(e.target.value)}/><Button variant="destructive" type="submit" disabled={mutation.isPending}>Confirm rejection</Button></form>}</> : <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">{p.rejectionReason || "Administrative approval is not a background verification."}</p>}</div>;
}

export function LiveProvidersPanel({ data }: { data: WorkspaceData }) {
  return <><SectionHeader title="The hands behind the help" description="Review provider applications before they can accept matching requests."/><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.providers.map(p => <ProviderCard key={p.id} provider={p} data={data}/>)}</div><ListPagination info={data.pages?.providers} label="providers"/>{!data.providers.length && <Empty title="Your team starts here" description="Provider applications will appear after an account submits an application from Settings."/>}</>;
}

export function LiveAccountsPanel({ data }: { data: WorkspaceData }) {
  const { mutation } = useWorkspace("admin");
  return <><SectionHeader title="Your platform, your people" description="Suspend or restore customer and provider access. Roles are managed securely on the server."/><div className="soft-card overflow-hidden">{data.accounts?.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-b-0"><div className="min-w-0"><p className="text-sm font-semibold">{a.name}</p><p className="mt-1 break-all text-xs text-muted-foreground">{a.email} · {a.role} · {a.suspended ? "Suspended" : "Active"}</p></div>{a.role !== "admin" && <Button variant={a.suspended ? "outline" : "destructive"} disabled={mutation.isPending} onClick={() => { if (window.confirm(`${a.suspended ? "Restore" : "Suspend"} access for ${a.name}?`)) mutation.mutate({ type: "suspend", userId: a.id, suspended: !a.suspended }); }}>{a.suspended ? "Restore access" : "Suspend"}</Button>}</div>)}</div><ListPagination info={data.pages?.accounts} label="accounts"/></>;
}

export function ProviderApplication({ data, role, onboarding = false }: { data: WorkspaceData; role: Role; onboarding?: boolean }) {
  const { mutation, actor } = useWorkspace(role);
  const router = useRouter();
  const provider = data.providers.find(p => p.id === actor.id);
  const [bio, setBio] = useState(provider?.bio ?? "");
  const [experience, setExperience] = useState(provider?.experienceYears ?? 0);
  const [areas, setAreas] = useState(provider?.areas.join(", ") ?? "");
  const [services, setServices] = useState(provider?.services ?? []);
  const [name, setName] = useState(data.profile.name === "Fixora customer" ? "" : data.profile.name);
  const [phone, setPhone] = useState(data.profile.phone);
  const [error, setError] = useState("");
  if (role === "admin") return null;
  if (role === "customer" && data.bookings.length) return <p className="mt-6 text-xs leading-relaxed text-muted-foreground">To become a provider, use a separate account. This account has customer booking history.</p>;
  return <form className={`soft-card max-w-2xl space-y-4 p-6 ${onboarding ? "h-fit" : "mt-6"}`} onSubmit={async e => { e.preventDefault(); setError(""); try { await mutation.mutateAsync({ type: "provider-profile", bio, experienceYears: experience, areas: areas.split(",").map(a => a.trim()).filter(Boolean), services, ...(!provider ? { profile: { name, phone } } : {}) }); router.push(onboarding ? "/provider" : "/provider/settings"); router.refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Your application could not be saved. Please try again."); } }}><h2 className="section-heading">{provider ? "Your provider profile" : "Become a service provider"}</h2><p className="text-xs leading-relaxed text-muted-foreground">Applications require administrator approval. Changing services or service areas sends your profile for review again.</p>{provider && <p className="text-xs capitalize text-primary">Status: {provider.status}{provider.rejectionReason && ` · ${provider.rejectionReason}`}</p>}
    {!provider && <><Label htmlFor="provider-name">Full name</Label><Input id="provider-name" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)}/><Label htmlFor="provider-phone">Phone number</Label><Input id="provider-phone" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="tel-national" value={phone} onChange={e => setPhone(e.target.value)}/></>}
    <Label htmlFor="provider-bio">About your work</Label><Textarea id="provider-bio" required minLength={10} maxLength={1000} value={bio} onChange={e => setBio(e.target.value)}/><Label htmlFor="provider-experience">Years of experience</Label><Input id="provider-experience" type="number" required min={0} max={60} value={experience} onChange={e => setExperience(Number(e.target.value))}/><Label htmlFor="provider-areas">Service area postal codes</Label><Input id="provider-areas" required placeholder="380015, 380009" value={areas} onChange={e => setAreas(e.target.value)}/><fieldset className="space-y-3"><legend className="mb-3 text-xs font-medium">Services you offer</legend>{data.services.filter(s => s.active).map(s => <label key={s.id} className="flex items-center gap-3 text-xs"><input type="checkbox" checked={services.includes(s.id)} onChange={e => setServices(e.target.checked ? [...services,s.id] : services.filter(id => id !== s.id))}/>{s.name}</label>)}</fieldset>{!data.services.some(s => s.active) && <p role="status" className="text-xs text-muted-foreground">No services are available for applications yet. Please try again later.</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<Button type="submit" disabled={mutation.isPending || !services.length}>{mutation.isPending ? "Saving application…" : provider ? "Save provider profile" : "Submit provider application"}</Button>{role === "provider" && <Link href="/provider/availability" className="ml-4 text-xs font-semibold text-primary">Manage availability →</Link>}</form>;
}

export function LiveSettingsPanel({ data, role }: { data: WorkspaceData; role: Role }) {
  const { mutation } = useWorkspace(role);
  const [name, setName] = useState(data.profile.name);
  const [phone, setPhone] = useState(data.profile.phone);
  return <><SectionHeader title="The little details" description="Keep your profile up to date. Sign-in identity is managed by Clerk."/><form className="soft-card max-w-2xl space-y-4 p-6" onSubmit={e => { e.preventDefault(); mutation.mutate({ type: "profile", name, phone }); }}><Label htmlFor="live-name">Full name</Label><Input id="live-name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)}/><Label htmlFor="live-email">Registration email</Label><Input id="live-email" readOnly value={data.profile.email}/><p className="text-[10px] text-muted-foreground">Use the account menu to manage your Clerk sign-in identity. This profile stores your registration email separately.</p><Label htmlFor="live-phone">Phone number</Label><Input id="live-phone" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={phone} onChange={e => setPhone(e.target.value)}/><Button type="submit" disabled={mutation.isPending}>Save profile</Button></form><ProviderApplication data={data} role={role}/><p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={16}/>Access is checked on the server, never through browser-selected roles.</p></>;
}
