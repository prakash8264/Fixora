"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CalendarDays, ChevronRight, CircleHelp, CreditCard, HouseHeart, LayoutDashboard, MapPin, Menu, Search, Settings2, ShieldCheck, Sparkles, Star, Users, Wrench, RotateCcw, FlaskConical, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/lib/use-workspace";
import { resetDemo } from "@/lib/demo/store";
import { isTerminal, type Role } from "@/lib/domain";
import { toast } from "sonner";
import { UserButton } from "@clerk/nextjs";

const navigation = {
  customer: [{ path: "", label: "Overview", icon: LayoutDashboard }, { path: "services", label: "Explore services", icon: Sparkles }, { path: "bookings", label: "My bookings", icon: CalendarDays }, { path: "addresses", label: "Saved addresses", icon: MapPin }, { path: "payments", label: "Payments", icon: CreditCard }, { path: "reviews", label: "My reviews", icon: Star }],
  provider: [{ path: "", label: "Overview", icon: LayoutDashboard }, { path: "requests", label: "Service requests", icon: ClipboardList }, { path: "bookings", label: "My jobs", icon: Wrench }, { path: "availability", label: "Clock in / out", icon: CalendarDays }, { path: "payments", label: "Earnings", icon: CreditCard }, { path: "reviews", label: "My reviews", icon: Star }],
  admin: [{ path: "", label: "Overview", icon: LayoutDashboard }, { path: "providers", label: "Providers", icon: Users }, { path: "users", label: "User accounts", icon: ShieldCheck }, { path: "bookings", label: "All bookings", icon: CalendarDays }, { path: "services", label: "Service catalog", icon: Wrench }, { path: "payments", label: "Payments", icon: CreditCard }],
};

export function WorkspaceShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, actor, isLive } = useWorkspace(role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const unread = data?.stats?.unread ?? data?.notifications.filter(n => n.recipientId === actor.id && !n.read).length ?? 0;
  const name = isLive ? data?.profile.name ?? "Your account" : role === "customer" ? data?.profile.name ?? "Aarav Sharma" : role === "provider" ? "Rohan Patel" : "Fixora Admin";
  const initials = name.split(" ").map(s => s[0]).slice(0, 2).join("");
  const sidebar = <div className="flex h-full flex-col px-5 py-7">
    <Link href={`/${role}`} className="mb-10 flex items-center gap-2.5 px-3" aria-label="Fixora overview"><div className="grid size-10 place-items-center rounded-xl bg-primary text-white"><HouseHeart size={23} strokeWidth={1.8} /></div><span className="text-[26px] font-extrabold tracking-[-1.3px]">fixora<span className="text-primary">.</span></span></Link>
    <div className="eyebrow mb-4 px-4 text-muted-foreground">Your workspace</div>
    <nav aria-label="Main navigation" className="space-y-1.5">{navigation[role].map(item => <Link key={item.path} href={`/${role}${item.path ? `/${item.path}` : ""}`} className="nav-link" data-active={pathname === `/${role}${item.path ? `/${item.path}` : ""}`} onClick={() => setMobileOpen(false)}><item.icon size={18} strokeWidth={1.8}/>{item.label}{item.path === "bookings" && <span className="ml-auto rounded-md bg-white/60 px-1.5 py-0.5 text-[10px]">{data?.stats?.active ?? data?.bookings.filter(b => !isTerminal(b.status) && (role !== "provider" || b.providerId === actor.id)).length ?? 0}</span>}</Link>)}</nav>
    <div className="mt-auto pt-8">
      <div className="mb-5 rounded-2xl border border-white/80 bg-[#e4ece6] p-4"><div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-[#d6e5d9]"><HouseHeart size={19} className="text-primary" /></div><p className="text-xs font-semibold">A happy home starts here.</p><p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">A little care. A little comfort.<br/>We’re here for both.</p><button onClick={() => setHelpOpen(true)} className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary">How Fixora works <ChevronRight size={13}/></button></div>
      <Link href={`/${role}/notifications`} className="nav-link" data-active={pathname.endsWith("/notifications")} onClick={() => setMobileOpen(false)}><Bell size={18}/>Notifications{unread > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-white">{unread}</span>}</Link>
      <Link href={`/${role}/settings`} className="nav-link" data-active={pathname.endsWith("/settings")} onClick={() => setMobileOpen(false)}><Settings2 size={18}/>Settings</Link>
      <button className="nav-link w-full" onClick={() => setHelpOpen(true)}><CircleHelp size={18}/>Help & information</button>
      <div className="mt-5 flex items-center gap-3 border-t px-2 pt-5"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d7e6dc] text-xs font-semibold text-primary">{initials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{name}</p><p className="mt-1 text-[10px] capitalize text-muted-foreground">{role} account{!isLive && " · Demo"}</p></div>{!isLive && <button className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted" onClick={() => setResetOpen(true)} aria-label="Reset demo data"><RotateCcw size={15}/></button>}</div>
    </div>
  </div>;

  return <div className="min-h-screen">
    <a href="#main-content" className="sr-only z-100 rounded-lg bg-primary p-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[230px] overflow-y-auto border-r border-[#d9e2df] bg-[#edf2ef] lg:block">{sidebar}</aside>
    <div className="lg:ml-[230px]">
      <header className="flex h-[82px] items-center justify-between gap-3 border-b border-[#dce5e1] px-5 md:px-9">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu/></Button><div className="hidden sm:block"><p className="eyebrow text-muted-foreground">Made for your everyday</p><p className="mt-1 text-xs font-medium">Your home, in good hands.</p></div><span className="text-xl font-bold lg:hidden sm:hidden">fixora.</span></div>
        <div className="flex items-center gap-3 md:gap-5">
          <form className="hidden items-center gap-2 md:flex" onSubmit={e => { e.preventDefault(); router.push(`/${role}/bookings?q=${encodeURIComponent(search)}`); }}><Search size={16} className="text-muted-foreground"/><input aria-label="Search bookings" placeholder="Search your bookings..." value={search} onChange={e => setSearch(e.target.value)} className="w-40 bg-transparent text-xs outline-none focus:ring-2 focus:ring-ring rounded-sm xl:w-48"/></form>
          <div className="hidden h-5 w-px bg-border md:block"/>
          {!isLive ? <div className="flex items-center gap-1.5"><FlaskConical size={14} className="text-muted-foreground"/><Select value={role} onValueChange={value => { if (value) router.push(`/${value}`); }}><SelectTrigger aria-label="Preview role" className="h-9! border-0 bg-transparent px-1 text-[11px]"><SelectValue>{role} demo</SelectValue></SelectTrigger><SelectContent><SelectItem value="customer">Customer demo</SelectItem><SelectItem value="provider">Provider demo</SelectItem><SelectItem value="admin">Admin demo</SelectItem></SelectContent></Select></div> : <span className="text-[11px] capitalize text-muted-foreground">{role} workspace</span>}
          <Link href={`/${role}/notifications`} className="relative grid size-10 place-items-center rounded-full border border-white bg-[#f3f6f4] shadow-sm" aria-label={`Notifications, ${unread} unread`}><Bell size={18}/>{unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background"/>}</Link>
          {isLive ? <UserButton/> : <Link href={`/${role}/settings`} aria-label="Account settings" className="hidden size-9 items-center justify-center rounded-full bg-[#dbe8df] text-xs font-semibold text-primary sm:flex">{initials}</Link>}
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1500px] px-5 py-7 md:px-9 md:py-9">{children}<footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9e2df] pt-5 text-[10px] text-muted-foreground"><span>© {new Date().getFullYear()} Fixora. A little care for your home.</span><span className="flex items-center gap-1.5"><ShieldCheck size={13}/>{isLive ? "Private workspace · Test Mode payments only" : "Interactive demo · No real payments or personal data"}</span></footer></main>
    </div>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-[280px]! gap-0 overflow-y-auto bg-[#edf2ef]"><SheetHeader className="sr-only"><SheetTitle>Fixora navigation</SheetTitle><SheetDescription>Navigate your demo workspace.</SheetDescription></SheetHeader>{sidebar}</SheetContent></Sheet>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Welcome to Fixora</DialogTitle><DialogDescription>A little care for your home.</DialogDescription></DialogHeader><div className="space-y-4 text-sm leading-relaxed"><p>Explore services, choose a slot, and submit a request. An eligible provider accepts and keeps you updated through the job.</p><p>Extra work always needs your approval. Payment happens after completion.</p><div className="rounded-xl bg-accent p-4 text-xs text-primary">{isLive ? "Your bookings are stored in PostgreSQL and are available only to authorized accounts. Checkout uses Razorpay Test Mode. Provider payouts and automated refunds are not part of this version." : "This workspace is a browser-local demo. Use the role selector to try both sides of a booking. Changes persist on this browser; no emails, real payments, or live customer requests are sent."}</div></div></DialogContent></Dialog>
    <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent><DialogHeader><DialogTitle>Reset the demo?</DialogTitle><DialogDescription>This removes your demo changes and restores the example bookings. It does not affect a real database.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setResetOpen(false)}>Keep my changes</Button><Button onClick={() => { resetDemo(); setResetOpen(false); toast.success("Demo restored."); }}>Reset demo</Button></div></DialogContent></Dialog>
  </div>;
}
