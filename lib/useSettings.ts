"use client";

import { useSyncExternalStore } from "react";
import type { Settings } from "./types";

const STORAGE_KEY = "read-it-to-me:settings";
const DEFAULT_SETTINGS: Settings = { rate: 0.85, level: "simple" };

let cached: Settings | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // best-effort persistence, same as the prototype
  }
  return DEFAULT_SETTINGS;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot(): Settings {
  if (cached === null) cached = readFromStorage();
  return cached;
}

function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  function save(next: Settings) {
    cached = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort persistence, same as the prototype
    }
    listeners.forEach((listener) => listener());
  }

  return { settings, save };
}
