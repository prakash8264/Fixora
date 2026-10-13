"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Actor } from "@/lib/types";
import { realtimeErrorMessage, watchWorkspace } from "@/lib/realtime";

export function LiveUpdates({ actor }: { actor: Actor }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState({ connected: false, detail: "" });
  const [retry, setRetry] = useState(0);
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let stopped = false;
    let connected = false;
    let authenticating = false;
    let channel: RealtimeChannel | undefined;
    const refresh = () => { if (!stopped) void queryClient.invalidateQueries({ queryKey: ["workspace","live",actor.id] }); };
    // Keep visible workspaces fresh during an outage, without calling this polling "Realtime".
    const fallback = setInterval(() => { if (!connected && document.visibilityState === "visible") refresh(); },15000);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return () => { stopped = true; clearInterval(fallback); };
    const supabase = createClient(url,key,{ accessToken: () => getToken() });
    const report = (state: string, error?: Error) => {
      if (stopped) return;
      if (state === "SUBSCRIBED") {
        connected = true;
        setConnection({ connected: true, detail: "" });
        refresh();
      } else if (["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(state)) {
        connected = false;
        const detail = `${state}: ${realtimeErrorMessage(error)}`;
        setConnection({ connected: false, detail });
        if (state !== "CLOSED") console.warn("Fixora Realtime",detail);
      }
    };
    const reconnect = async () => {
      if (stopped || authenticating) return;
      authenticating = true;
      try {
        // Clerk can still be loading on the first render. Never join with a null/stale token.
        const token = await getToken({ skipCache: true });
        if (stopped) return;
        if (!token) throw new Error("No Clerk session token is available. Sign in again.");
        await supabase.realtime.setAuth(token);
        if (stopped) return;
        if (!connected) {
          if (channel) await supabase.removeChannel(channel);
          if (stopped) return;
          channel = watchWorkspace(supabase,{ id: actor.id, role: actor.role },refresh,report);
        }
        refresh();
      } catch (error) { report("CHANNEL_ERROR",error instanceof Error ? error : new Error("Could not refresh the live session.")); }
      finally { authenticating = false; }
    };
    void reconnect();
    const timer = setInterval(() => { void reconnect(); },45000);
    const visible = () => { if (document.visibilityState === "visible") void reconnect(); };
    window.addEventListener("online",reconnect);
    document.addEventListener("visibilitychange",visible);
    return () => {
      stopped = true;
      clearInterval(timer); clearInterval(fallback);
      window.removeEventListener("online",reconnect);
      document.removeEventListener("visibilitychange",visible);
      void supabase.removeAllChannels();
    };
  },[actor.id,actor.role,getToken,isLoaded,isSignedIn,queryClient,retry]);
  const status = !configured ? "Supabase credentials missing — checking automatically every 15 seconds."
    : connection.connected ? "Live updates connected"
    : connection.detail ? "Live connection unavailable — checking automatically every 15 seconds."
    : "Connecting live updates…";
  return <div className="border-b bg-accent/60 px-4 py-2 text-center text-[10px] text-primary"><p role="status">{status}</p>{connection.detail && <details className="mx-auto mt-1 max-w-2xl"><summary className="cursor-pointer underline">Connection details</summary><p className="my-2 break-words">{connection.detail}</p><p className="mb-2">Check Clerk–Supabase authentication if the reason mentions JWT or permissions. Network or service errors retry automatically.</p><button type="button" className="rounded px-2 py-1 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setRetry(value => value+1)}>Retry live connection</button></details>}</div>;
}
