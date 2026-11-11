"use client";

import { createContext, useContext, useEffect, useState, useMemo } from "react";

type DisplaySettings = { dark: boolean; textures: boolean; setDark: (value: boolean) => void; setTextures: (value: boolean) => void };
const DisplayContext = createContext<DisplaySettings | null>(null);

export function DisplayProvider({ children }: { children: React.ReactNode }) {
  // Human-selected dark-first launch; the server HTML matches this initial state.
  // Preferences remain in memory only, never a persisted authority setting.
  const [dark, setDark] = useState(true);
  const [textures, setTextures] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("dark") === dark) return;
    // Switch all theme foreground/background pairs together, then restore the
    // ordinary interaction transitions. Display state is still memory-only.
    root.dataset.themeChanging = "true";
    root.classList.toggle("dark", dark);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { delete root.dataset.themeChanging; });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); delete root.dataset.themeChanging; };
  }, [dark]);
  useEffect(() => { document.documentElement.dataset.texture = textures ? "on" : "off"; }, [textures]);
  const value = useMemo(() => ({ dark, textures, setDark, setTextures }), [dark, textures]);
  return <DisplayContext value={value}>{children}</DisplayContext>;
}

export function useDisplaySettings() {
  const context = useContext(DisplayContext);
  if (!context) throw new Error("Display controls require DisplayProvider");
  return context;
}

export function ThemeToggle() {
  const { dark, setDark } = useDisplaySettings();
  return <button className="theme-toggle" onClick={() => setDark(!dark)} aria-label={`Switch to ${dark ? "light" : "dark"} theme`} aria-pressed={dark}>
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></> : <path d="M20.5 14a8.8 8.8 0 0 1-10.7-10.5A9 9 0 1 0 20.5 14Z" />}</svg>
  </button>;
}

export function TextureToggle() {
  const { textures, setTextures } = useDisplaySettings();
  return <button className="texture-toggle" aria-pressed={!textures} onClick={() => setTextures(!textures)}>Textures {textures ? "on" : "reduced"}</button>;
}
