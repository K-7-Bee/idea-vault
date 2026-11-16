"use client";

import { useRef } from "react";
import { useSessionGate } from "./use-session-gate";

// Hides server-rendered private content whenever the session is unverified or logging out.
export default function SessionBoundary({ ownerId, children }: { ownerId: string; children: React.ReactNode }) {
  const region = useRef<HTMLDivElement>(null);
  const { locked, retry } = useSessionGate(ownerId, (isLocked) => {
    if (isLocked) region.current?.querySelectorAll("audio, video").forEach((m) => (m as HTMLMediaElement).pause());
  });
  return (
    <>
      {locked && (
        <section role="alert" className="rounded-2xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold">Vault locked</h2>
          <p className="mt-2">Verify the original account to continue.</p>
          <button onClick={retry} className="mt-4 underline">Verify account again</button>
        </section>
      )}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined}>
        {children}
      </div>
    </>
  );
}
