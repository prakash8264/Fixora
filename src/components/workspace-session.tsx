"use client";

import { createContext, useContext } from "react";
import type { Actor } from "@/lib/types";
import { LiveUpdates } from "./live-updates";

const WorkspaceSession = createContext<Actor | null>(null);
export const useWorkspaceSession = () => useContext(WorkspaceSession);
export function WorkspaceSessionProvider({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  return <WorkspaceSession.Provider value={actor}><LiveUpdates actor={actor}/>{children}</WorkspaceSession.Provider>;
}
