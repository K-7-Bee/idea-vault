"use client";

import { useState } from "react";
import { usd } from "@/lib/ai/limits";
import { useVaultWriter } from "../use-vault-writer";

// Phase 5A: the assistant's status, this month's spend against the ceiling, and deleting every
// saved conversation. Usage totals stay: they are the record the spending cap is computed from.
export default function AiSettings({ ownerId, status }: {
  ownerId: string;
  status: { state: "off" | "on" | "paused"; reason: string | null; model: string; monthlyUsd: number; dailyRequests: number;
    monthUsd: number | null; todayRequests: number | null; conversations: number | null };
}) {
  const { run, busy, message, setMessage, online } = useVaultWriter(ownerId);
  const [count, setCount] = useState(status.conversations);
  const [confirming, setConfirming] = useState(false);
  const label = { off: "Off", on: "On", paused: "Paused (limit reached)" }[status.state];

  function deleteAll() {
    void run(async (client) => {
      const r = await client.from("ai_conversations").delete().eq("user_id", ownerId).select("id");
      return r.error ? { ok: false, reason: "failed", message: "Couldn't delete the conversations. Try again." } as const : { ok: true, value: r.data?.length ?? 0 } as const;
    }, null, (n) => {
      setCount(0);
      setConfirming(false);
      setMessage({ text: `${n} ${n === 1 ? "conversation" : "conversations"} deleted.`, error: false });
    });
  }

  return (
    <section aria-labelledby="ai-heading" className="mt-8 rounded-2xl border border-line bg-card p-5">
      <h3 id="ai-heading" className="text-lg font-semibold">Assistant (Gemini)</h3>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[12rem_1fr]">
        <dt className="text-muted">Status</dt><dd><span className="font-semibold">{label}</span>{status.reason ? ` · ${status.reason}` : ""}</dd>
        <dt className="text-muted">Model</dt><dd>{status.model} (paid tier)</dd>
        <dt className="text-muted">This month</dt>
        <dd>{status.monthUsd === null ? "Unknown" : `${usd(status.monthUsd)} of $${status.monthlyUsd.toFixed(2)}`} <span className="text-muted">(resets on the 1st, UTC)</span></dd>
        <dt className="text-muted">Today</dt>
        <dd>{status.todayRequests === null ? "Unknown" : `${status.todayRequests} of ${status.dailyRequests} questions`}</dd>
        <dt className="text-muted">Saved conversations</dt><dd>{count ?? "Unknown"}</dd>
      </dl>
      <p className="mt-3 text-sm text-muted">
        The assistant only reads records you tick in a project&apos;s Assistant tab and never changes them. Switch it off by removing
        AI_ENABLED or the key in Vercel; delete the key in Google Cloud to stop it immediately.
      </p>
      {count !== null && count > 0 && (
        <div className="mt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm deleting all conversations">
              <span className="text-sm">Delete all {count} saved conversations? Spending totals are kept.</span>
              <button type="button" className="rounded-lg border border-danger px-3 py-1 text-sm text-danger" disabled={busy || !online} onClick={deleteAll}>Delete all</button>
              <button type="button" className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => setConfirming(true)}>Delete all conversations</button>
          )}
        </div>
      )}
      {message && <p role={message.error ? "alert" : "status"} className={`mt-3 text-sm ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p>}
    </section>
  );
}
