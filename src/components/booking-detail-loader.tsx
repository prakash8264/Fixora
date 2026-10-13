"use client";

import { useQuery } from "@tanstack/react-query";
import { BookingDetail } from "./booking-detail";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useWorkspace } from "@/lib/use-workspace";
import { requestJson } from "@/lib/checkout";
import { readDemo } from "@/lib/demo/store";
import { getDemoWorkspace } from "@/lib/demo/pagination";
import { workspaceOptionsSchema } from "@/lib/pagination";
import type { Role } from "@/lib/domain";
import type { WorkspaceData } from "@/lib/types";

export function BookingDetailLoader({ bookingId, role, onClose }: { bookingId: string; role: Role; onClose: () => void }) {
  const { actor, isLive } = useWorkspace(role);
  const query = useQuery({ queryKey: ["workspace",isLive ? "live" : "demo",actor.id,actor.role,"booking",bookingId], queryFn: (): Promise<WorkspaceData> | WorkspaceData => isLive ? requestJson(`/api/workspace?bookingId=${encodeURIComponent(bookingId)}`) : getDemoWorkspace(readDemo(),actor,{ ...workspaceOptionsSchema.parse({}), bookingId }), enabled: !!actor.id });
  if (query.data && !query.isError) return <BookingDetail bookingId={bookingId} role={role} data={query.data} onClose={onClose}/>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{query.isError ? "Couldn’t open this booking" : "Loading booking…"}</DialogTitle><DialogDescription>{query.isError ? query.error.message : "Fetching this booking’s authorized details, quotations, and history."}</DialogDescription></DialogHeader>{query.isError && <Button onClick={() => query.refetch()}>Try again</Button>}</DialogContent></Dialog>;
}
