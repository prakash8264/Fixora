"use client";

import { createDemoState } from "./seed";
import { applyCommand, type Command } from "./workflow";
import type { Actor, DemoState } from "../types";

const key = "fixora-demo-v1";
export const demoChangeEvent = "fixora:demo-change";
let memory: DemoState | undefined;

export function readDemo(): DemoState {
  try {
    const stored = localStorage.getItem(key);
    if (stored) { const state = JSON.parse(stored); if (state.version === 1 && Array.isArray(state.bookings) && Array.isArray(state.services)) return state; }
  } catch { /* Browser storage may be unavailable; keep a session-only demo. */ }
  return memory ??= createDemoState();
}

function write(state: DemoState) {
  memory = state;
  // ponytail: localStorage is a single-browser demo, not a live booking database.
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Session-only fallback. */ }
  window.dispatchEvent(new Event(demoChangeEvent));
  return state;
}

export function runDemo(actor: Actor, command: Command) { return write(applyCommand(readDemo(), actor, command)); }
export function resetDemo() { return write(createDemoState()); }
