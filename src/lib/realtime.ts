import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "./types";

export function realtimeErrorMessage(error?: Error) {
  // Show a useful reason, never JWTs or API credentials that a gateway may echo.
  return (error?.message || "The WebSocket connection was interrupted or timed out.")
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[redacted token]")
    .replace(/(?:sb_(?:publishable|secret)_|(?:sk|pk)_(?:test|live)_)[A-Za-z0-9_-]+/g,"[redacted key]")
    .slice(0,300);
}

export function watchWorkspace(client: SupabaseClient, actor: Actor, refresh: () => void, status: (state: string, error?: Error) => void) {
  const channel = client.channel(`fixora:${actor.id}`,{ config: { postgres_changes_options: { wait: true } } })
    .on("postgres_changes",{ event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${actor.id}` },refresh)
    .on("postgres_changes",{ event: "*", schema: "public", table: "bookings", ...(actor.role !== "admin" ? { filter: `${actor.role === "customer" ? "customer_id" : "provider_id"}=eq.${actor.id}` } : {}) },refresh)
    .on("system",{},payload => { if (payload.status === "error") status("CHANNEL_ERROR",new Error(payload.message || "Postgres change subscription failed.")); });
  if (actor.role === "provider") channel.on("postgres_changes",{ event: "*", schema: "public", table: "booking_requests", filter: `provider_id=eq.${actor.id}` },refresh);
  return channel.subscribe(status);
}
