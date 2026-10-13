"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServiceIcon } from "./service-icon";
import { useWorkspace } from "@/lib/use-workspace";
import { bookingSchema, localDate, money } from "@/lib/domain";
import { normalizeSchedule, scheduleLabel } from "@/lib/scheduling";
import { VisitTiming } from "./visit-timing";
import type { DemoState } from "@/lib/types";

export function BookServiceDialog({ data, initialService, onClose }: { data: DemoState; initialService?: string; onClose: () => void }) {
  const { mutation, isLive } = useWorkspace("customer");
  const [requestKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [addressId, setAddressId] = useState(data.addresses[0]?.id ?? "");
  const [date, setDate] = useState(localDate(1));
  const [scheduleMode, setScheduleMode] = useState<"scheduled" | "asap">("scheduled");
  const [preferredTime, setPreferredTime] = useState("09:00");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const service = data.services.find(s => s.id === serviceId);
  const address = data.addresses.find(a => a.id === addressId);
  const next = () => {
    if (step === 0 && !service) { setError("Choose the service your home needs."); return; }
    if (step === 1) { const result = bookingSchema.safeParse({ serviceId, addressId, ...timing, description }); if (!result.success) { setError(result.error.issues[0].message); return; } try { normalizeSchedule(result.data); } catch { setError("Choose a valid future arrival date and time."); return; } }
    setError(""); setStep(step + 1);
  };
  const timing = scheduleMode === "asap" ? { scheduleMode } : { scheduleMode, date, preferredTime };
  const submit = async () => { try { await mutation.mutateAsync({ type: "book", requestKey, serviceId, addressId, ...timing, description }); onClose(); } catch { /* Mutation displays the validation error. */ } };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-[620px]"><DialogHeader><p className="eyebrow mb-2 text-primary">A little help is on the way</p><DialogTitle className="text-xl font-bold">Book a service</DialogTitle><DialogDescription>Tell us what you need. We’ll find the right hands.</DialogDescription></DialogHeader>
    <div className="my-2 flex items-center gap-3">{["Choose a service", "Your visit", "Review"].map((label,i) => <div key={label} className="flex flex-1 items-center gap-2"><span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${i <= step ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{i < step ? <Check size={12}/> : i + 1}</span><span className={`text-[10px] ${i === step ? "font-bold" : "text-muted-foreground"}`}>{label}</span></div>)}</div>
    {step === 0 && <div className="grid grid-cols-2 gap-3 py-2">{data.services.filter(s => s.active).map(s => <button key={s.id} onClick={() => setServiceId(s.id)} aria-pressed={s.id === serviceId} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${s.id === serviceId ? "border-primary bg-accent" : "bg-background/40 hover:bg-accent/50"}`}><ServiceIcon service={s} small/><div><p className="text-xs font-semibold">{s.name}</p><p className="mt-1 text-[10px] text-muted-foreground">Visit fee {money(s.price)}</p></div>{s.id === serviceId && <Check size={14} className="ml-auto text-primary"/>}</button>)}</div>}
    {step === 1 && <div className="space-y-5 py-2">
      <div className="space-y-2"><Label htmlFor="booking-address">Service address</Label><Select value={addressId} onValueChange={value => setAddressId(value ?? "")}><SelectTrigger id="booking-address" className="h-11! w-full"><SelectValue placeholder="Choose a saved address">{address ? `${address.label} · ${address.line}` : "Choose a saved address"}</SelectValue></SelectTrigger><SelectContent>{data.addresses.map(a => <SelectItem key={a.id} value={a.id}>{a.label} · {a.line}</SelectItem>)}</SelectContent></Select>{!data.addresses.length && <p className="text-xs text-destructive">Add an address from Saved addresses before booking.</p>}</div>
      <VisitTiming mode={scheduleMode} date={date} time={preferredTime} onMode={setScheduleMode} onDate={setDate} onTime={setPreferredTime} prefix="booking"/>
      <div className="space-y-2"><Label htmlFor="booking-description">What needs a little care?</Label><Textarea id="booking-description" placeholder="For example: The kitchen tap has been dripping for a few days…" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} className="min-h-24"/><p className="text-[10px] text-muted-foreground">10–1,000 characters. Keep sensitive personal information out of the description.</p></div>
    </div>}
    {step === 2 && service && <div className="space-y-4 py-2"><div className="flex items-center gap-3 rounded-xl bg-background p-4"><ServiceIcon service={service}/><div><p className="font-semibold">{service.name}</p><p className="mt-1 text-xs text-muted-foreground">{scheduleMode === "asap" ? "As soon as possible · arrival estimate after acceptance" : scheduleLabel({ date, slot: "morning", scheduleMode, preferredTime })}</p></div></div><div className="flex items-start gap-3 text-xs"><MapPin size={17} className="shrink-0 text-primary"/><div><p className="font-semibold">{address?.label}</p><p className="mt-1 leading-relaxed text-muted-foreground">{address?.line}, {address?.city} {address?.postalCode}</p></div></div><p className="rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">{description}</p><div className="flex items-center justify-between border-t pt-4"><div><p className="text-xs font-semibold">Visit / inspection fee</p><p className="mt-1 text-[10px] text-muted-foreground">Not the full job price. Nothing to pay upfront.</p></div><span className="text-xl font-bold">{money(service.price)}</span></div><p className="rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">The provider inspects and sends a quotation before work starts. Approve it and pay the visit fee + approved labour and materials once after completion. Decline after inspection and pay only the visit fee. If the provider never arrives, you owe nothing.</p><div className="flex items-start gap-2 rounded-xl bg-accent p-3 text-[10px] leading-relaxed text-primary"><ShieldCheck size={16} className="shrink-0"/>{isLive ? "Your request will be saved securely. Matching clocked-in providers can see it; acceptance checks appointment conflicts. Private details are shared after assignment." : "This creates a demo booking only. Provider matching uses service, postal code, clock status, and appointment conflicts."}</div></div>}
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
    <div className="flex justify-between border-t pt-4"><Button variant="ghost" onClick={() => step ? setStep(step - 1) : onClose()}><ArrowLeft size={14}/>{step ? "Back" : "Cancel"}</Button>{step < 2 ? <Button onClick={next}>Continue<ArrowRight size={14}/></Button> : <Button disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? "Requesting…" : "Request service"}<Check size={14}/></Button>}</div>
  </DialogContent></Dialog>;
}
