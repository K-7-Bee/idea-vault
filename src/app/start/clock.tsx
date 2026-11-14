"use client";

import { useSyncExternalStore } from "react";
import { greetingFor } from "@/lib/start-page";

// One shared clock that ticks at the start of every minute.
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    onChange();
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
  };
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
  // Timers pause while the tab is hidden or the computer sleeps, so check again on return.
  const resync = () => {
    if (document.visibilityState !== "visible") return;
    clearTimeout(timer);
    tick();
  };
  document.addEventListener("visibilitychange", resync);
  window.addEventListener("pageshow", resync);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", resync);
    window.removeEventListener("pageshow", resync);
  };
}

// Minute-precision timestamp, so the snapshot only changes once a minute.
const getSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
// The server doesn't know the visitor's time zone, so it renders a placeholder.
const getServerSnapshot = () => null;

export default function Clock() {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const date = now === null ? null : new Date(now);

  return (
    <div className="text-center" aria-live="off">
      <p className="sp-muted font-nav text-lg sm:text-xl" style={{ visibility: date ? "visible" : "hidden" }}>
        {date ? `${greetingFor(date.getHours())}, Kaushik` : "Hello, Kaushik"}
      </p>
      <time
        dateTime={date?.toISOString()}
        className="mt-2 block text-6xl font-semibold tabular-nums tracking-tight sm:text-8xl"
        style={{ visibility: date ? "visible" : "hidden" }}
      >
        {date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "00:00"}
      </time>
      <p className="sp-muted mt-3 text-base sm:text-lg" style={{ visibility: date ? "visible" : "hidden" }}>
        {date
          ? date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })
          : "Saturday, 1 January 2000"}
      </p>
    </div>
  );
}
