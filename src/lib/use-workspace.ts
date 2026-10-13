"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ZodError } from "zod";
import type { Role } from "./domain";
import { demoAdminId, demoCustomerId, demoProviderId } from "./demo/seed";
import { demoChangeEvent, readDemo, runDemo } from "./demo/store";
import type { Command } from "./demo/workflow";
import type { WorkspaceData } from "./types";
import { isLive } from "./app-mode";
import { requestJson } from "./checkout";
import { useWorkspaceSession } from "@/components/workspace-session";
import { parseWorkspaceOptions, workspaceOptionsSchema, type WorkspaceOptions } from "./pagination";
import { getDemoWorkspace } from "./demo/pagination";

export function useWorkspace(role: Role) {
  const client = useQueryClient();
  const session = useWorkspaceSession();
  const actor = isLive ? session ?? { role, id: "" } : { role, id: role === "customer" ? demoCustomerId : role === "provider" ? demoProviderId : demoAdminId };
  const pathname = usePathname();
  const params = useSearchParams();
  const section = pathname?.split("/")[2] || "overview";
  const urlParams = new URLSearchParams(params?.toString());
  urlParams.set("section",section);
  let options;
  try { options = parseWorkspaceOptions(urlParams); }
  catch { options = workspaceOptionsSchema.parse({ section: workspaceOptionsSchema.shape.section.safeParse(section).data ?? "overview" }); }
  const workspaceUrl = `/api/workspace?${new URLSearchParams(Object.entries(options).map(([key,value]) => [key,String(value)]))}`;
  const queryKey = ["workspace",isLive ? "live" : "demo",actor.id,actor.role,options];
  const query = useQuery({
    queryKey,
    queryFn: (): Promise<WorkspaceData> | WorkspaceData => isLive ? requestJson(workspaceUrl) : getDemoWorkspace(readDemo(),actor,options),
    enabled: !isLive || !!session,
    // Keep the booking filters mounted while typing; old rows are disabled until the new page arrives.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === actor.id && previousQuery.queryKey[3] === actor.role && options.section === "bookings" && (previousQuery.queryKey[4] as WorkspaceOptions | undefined)?.section === "bookings" ? previous : undefined,
  });
  useEffect(() => {
    if (isLive) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: ["workspace","demo"] }); };
    const storage = (event: StorageEvent) => { if (event.key === "fixora-demo-v1") refresh(); };
    window.addEventListener(demoChangeEvent,refresh);
    window.addEventListener("storage",storage);
    return () => { window.removeEventListener(demoChangeEvent,refresh); window.removeEventListener("storage",storage); };
  },[client]);
  const mutation = useMutation({
    mutationFn: async (command: Command) => {
      if (!isLive) return runDemo(actor,command);
      if (!session) throw new Error("Sign in to continue.");
      const result = await requestJson<{ result?: { captured?: boolean } }>("/api/actions",{ ...command,...(command.type === "book" ? { requestKey: command.requestKey ?? crypto.randomUUID() } : {}) });
      if (command.type === "pay" && !result.result?.captured) toast.info("No captured payment found yet. Please check again shortly.");
      return result;
    },
    onSuccess: async (_data,command) => {
      // Never write a completed mutation's old page into the current page after navigation.
      await client.invalidateQueries({ queryKey: ["workspace",isLive ? "live" : "demo",actor.id,actor.role] });
      if (command.type !== "pay") toast.success(isLive ? "Changes saved." : "Changes saved in your demo workspace.");
    },
    onError: error => toast.error(error instanceof ZodError ? error.issues[0]?.message : error.message),
  });
  return { ...query, actor, mutation, isLive };
}
