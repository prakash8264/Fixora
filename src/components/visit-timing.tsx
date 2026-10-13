"use client";

import { Clock3, CalendarDays } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { localDate } from "@/lib/domain";
import { arrivalTimes, timeLabel } from "@/lib/scheduling";

export function VisitTiming({ mode, date, time, onMode, onDate, onTime, prefix = "visit" }: { mode: "asap" | "scheduled"; date: string; time: string; onMode: (mode: "asap" | "scheduled") => void; onDate: (date: string) => void; onTime: (time: string) => void; prefix?: string }) {
  return <div className="space-y-4"><fieldset><legend className="mb-2 text-sm font-medium">When would you like a visit?</legend><div className="grid gap-3 sm:grid-cols-2">{[{ mode: "asap" as const, title: "As soon as possible", text: "A free, clocked-in provider confirms an arrival estimate.", icon: Clock3 },{ mode: "scheduled" as const, title: "Schedule a visit", text: "Choose a date and preferred arrival time.", icon: CalendarDays }].map(option => <button key={option.mode} type="button" aria-pressed={mode === option.mode} onClick={() => onMode(option.mode)} className={`rounded-xl border p-4 text-left ${mode === option.mode ? "border-primary bg-accent text-primary" : "bg-background/30"}`}><option.icon size={17} className="mb-3"/><span className="block text-xs font-semibold">{option.title}</span><span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{option.text}</span></button>)}</div></fieldset>
    {mode === "scheduled" && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`${prefix}-date`}>Preferred date</Label><Input required id={`${prefix}-date`} type="date" min={localDate()} value={date} onChange={e => onDate(e.target.value)}/></div><div className="space-y-2"><Label htmlFor={`${prefix}-time`}>Preferred arrival · IST</Label><select required id={`${prefix}-time`} className="h-11 w-full rounded-lg border bg-background px-3 text-xs" value={time} onChange={e => onTime(e.target.value)}>{arrivalTimes.map(t => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></div></div>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">{mode === "asap" ? "Arrival is an estimate, not an instant-service guarantee. Your request stays open until accepted or cancelled." : "This is a preferred arrival time, not a promised completion time. Choose a future time; availability is checked again when the provider accepts."} Providers reserve an estimated visit duration plus a 30-minute travel buffer. Longer work starts only after quotation approval.</p>
  </div>;
}
