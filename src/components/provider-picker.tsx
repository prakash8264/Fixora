"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceSession } from "./workspace-session";
import { PaginationControls } from "./list-pagination";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { requestJson } from "@/lib/checkout";
import type { WorkspaceData } from "@/lib/types";

export function ProviderPicker({ value, onChange, excludeId }: { value: string; onChange: (id: string) => void; excludeId: string | null }) {
  const actor = useWorkspaceSession();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const query = useQuery({ queryKey: ["workspace","live",actor?.id,actor?.role,"providers",page,size], queryFn: () => requestJson<WorkspaceData>(`/api/workspace?section=providers&page=${page}&pageSize=${size}`), enabled: actor?.role === "admin" });
  const info = query.data?.pages?.providers;
  return <div className="space-y-2"><Label htmlFor="reassign-provider">Reassign provider</Label><select id="reassign-provider" className="h-11 w-full rounded-lg border px-3 text-xs" required disabled={query.isPending || query.isError} value={value} onChange={e => onChange(e.target.value)}><option value="">{query.isPending ? "Loading providers…" : "Choose another approved provider"}</option>{query.data?.providers.filter(p => p.status === "approved" && !p.suspended && p.id !== excludeId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="text-[10px] text-muted-foreground">Browse all provider pages. Only approved, unsuspended providers can be selected; eligibility is checked before reassignment.</p>
    {query.isError && <div role="alert" className="text-xs text-destructive">Couldn’t load providers. <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button></div>}
    {info && <PaginationControls info={info} label="providers" onPage={next => { onChange(""); setPage(next); }} onSize={next => { onChange(""); setSize(next); setPage(1); }}/>}
  </div>;
}
