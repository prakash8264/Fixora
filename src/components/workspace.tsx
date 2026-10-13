"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dashboard } from "./dashboard";
import { WorkspaceShell } from "./workspace-shell";
import { BookingList } from "./booking-list";
import { BookServiceDialog } from "./book-service-dialog";
import { BookingDetailLoader } from "./booking-detail-loader";
import { ListPagination } from "./list-pagination";
import { AddressesPanel, NotificationsPanel, PaymentsPanel, ProvidersPanel, RequestsPanel, ReviewsPanel, SectionHeader, ServicesPanel, SettingsPanel } from "./workspace-panels";
import { useWorkspace } from "@/lib/use-workspace";
import { bookingStatuses, statusLabels, type Role } from "@/lib/domain";
import type { Booking } from "@/lib/types";
import { LiveAccountsPanel, LiveAddressesPanel, LivePaymentsPanel, LiveProvidersPanel, LiveRequestsPanel, LiveReviewsPanel, LiveSettingsPanel } from "./live-panels";
import { ProviderClock } from "./provider-clock";

export function Workspace({ role, section }: { role: Role; section: string }) {
  const { data, isLoading, isError, refetch, isLive, isPlaceholderData } = useWorkspace(role);
  const params = useSearchParams();
  const router = useRouter();
  const [book, setBook] = useState<{ serviceId?: string } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const onBooking = (booking: Booking) => setBookingId(booking.id);
  const status = params.get("status") ?? "all";
  const search = params.get("q") ?? "";
  const filter = (key: string, value: string) => { const next = new URLSearchParams(params); next.delete("page"); if (value && value !== "all") next.set(key,value); else next.delete(key); router.replace(`/${role}/bookings?${next.toString()}`, { scroll: false }); };
  const bookings = data?.bookings ?? [];
  return <WorkspaceShell role={role}>
    {isLoading && <div aria-label="Loading workspace" className="space-y-6"><Skeleton className="h-16 w-2/3"/><Skeleton className="h-60 w-full rounded-3xl"/><div className="grid grid-cols-2 gap-5 xl:grid-cols-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl"/>)}</div></div>}
    {isError && <div className="surface-panel p-8"><h1 className="section-heading">Couldn’t load the workspace</h1><p className="mt-2 text-xs text-muted-foreground">Please try again. Your saved data has not been changed.</p><Button className="mt-4" onClick={() => refetch()}>Try again</Button></div>}
    {data && <>
      {section === "" && <Dashboard role={role} data={data} onBook={serviceId => setBook({ serviceId })} onBooking={onBooking}/>}
      {section === "services" && <ServicesPanel role={role} data={data} onBook={serviceId => setBook({ serviceId })}/>}
      {section === "bookings" && <><SectionHeader title={role === "customer" ? "Your home-care story" : role === "provider" ? "Your assigned jobs" : "Every booking, in one place"} description="Follow every request, inspection, quotation, and final payment." action={role === "customer" && <Button onClick={() => setBook({})}><Plus size={15}/>Book a service</Button>}/>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap gap-1.5">{[["all","All bookings"],...bookingStatuses.map(key => [key,statusLabels[key]])].map(([key,label]) => <button key={key} aria-pressed={status === key} onClick={() => filter("status",key)} className={`rounded-lg px-3 py-2.5 text-[11px] ${status === key ? "soft-inset font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>)}</div><div className="relative"><Search size={14} className="absolute left-3 top-3.5 text-muted-foreground"/><Input aria-label="Filter bookings" placeholder="Search bookings…" maxLength={100} value={search} onChange={e => filter("q",e.target.value)} className="h-11 pl-9"/></div></div>
        <fieldset disabled={isPlaceholderData} aria-busy={isPlaceholderData} className="soft-card min-w-0 overflow-hidden p-4"><legend className="sr-only">Booking results</legend>{isPlaceholderData && <p role="status" className="mb-3 text-xs text-muted-foreground">Loading matching bookings…</p>}<BookingList bookings={bookings} data={data} onBooking={onBooking}/></fieldset>
        {!isPlaceholderData && <ListPagination info={data.pages?.bookings} label="bookings"/>}
      </>}
      {section === "addresses" && (isLive ? <LiveAddressesPanel data={data}/> : <AddressesPanel data={data}/>)}
      {section === "requests" && (isLive ? <LiveRequestsPanel data={data}/> : <RequestsPanel data={data}/>)}
      {section === "notifications" && <NotificationsPanel role={role} data={data} onBooking={onBooking} onBookingId={setBookingId}/>}
      {section === "payments" && (isLive ? <LivePaymentsPanel role={role} data={data} onBooking={onBooking}/> : <PaymentsPanel role={role} data={data} onBooking={onBooking}/>)}
      {section === "reviews" && (isLive ? <LiveReviewsPanel role={role} data={data} onBooking={onBooking}/> : <ReviewsPanel role={role} data={data} onBooking={onBooking}/>)}
      {section === "providers" && (isLive ? <LiveProvidersPanel data={data}/> : <ProvidersPanel data={data}/>)}
      {section === "users" && isLive && <LiveAccountsPanel data={data}/>}
      {section === "availability" && <ProviderClock data={data}/>}
      {section === "settings" && (isLive ? <LiveSettingsPanel role={role} data={data}/> : <SettingsPanel role={role} data={data}/>)}
      {!isLive && <ListPagination info={section === "requests" ? data.pages?.requests : section === "providers" ? data.pages?.providers : undefined} label={section === "requests" ? "service requests" : "providers"}/>}
      {book && <BookServiceDialog data={data} initialService={book.serviceId} onClose={() => setBook(null)}/>}
      {bookingId && <BookingDetailLoader key={bookingId} bookingId={bookingId} role={role} onClose={() => setBookingId(null)}/>}
    </>}
  </WorkspaceShell>;
}
