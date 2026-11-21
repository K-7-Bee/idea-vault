import { MAX_OUTPUT_TOKENS, TIMEOUT_MS } from "./limits";

// Server only. A minimal Gemini adapter over the REST generateContent endpoint (no SDK). The key
// goes in the x-goog-api-key header, never the URL, and is never logged or returned. No tools or
// function calling: the model can only return text.

export type Turn = { role: "user" | "model"; text: string };
export type GeminiResult =
  | { ok: true; text: string; inputTokens: number; outputTokens: number; finishReason: string }
  | { ok: false; kind: "timeout" | "auth" | "rate" | "blocked" | "failed"; message: string };

function base(): string {
  // Tests point this at the synthetic fixture; production always uses Google.
  const test = process.env.VAULT_E2E === "1" ? process.env.GEMINI_TEST_BASE : undefined;
  return test || "https://generativelanguage.googleapis.com";
}

export async function generate(opts: { key: string; model: string; system: string; turns: Turn[] }): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${base()}/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: "LOW" } },
      }),
    });
  } catch {
    return controller.signal.aborted
      ? { ok: false, kind: "timeout", message: "Gemini took too long to answer. Try a shorter question or fewer records." }
      : { ok: false, kind: "failed", message: "Gemini couldn't be reached. Try again." };
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => null) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  } | null;
  if (response.status === 401 || response.status === 403) return { ok: false, kind: "auth", message: "Gemini refused the API key. Check the key and that billing is enabled." };
  if (response.status === 429) return { ok: false, kind: "rate", message: "Gemini is limiting requests right now. Try again in a minute." };
  if (!response.ok || !body) return { ok: false, kind: "failed", message: `Gemini couldn't answer (${response.status}). Try again.` };

  const usage = body.usageMetadata ?? {};
  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    const reason = body.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no text";
    return { ok: false, kind: "blocked", message: `Gemini returned no answer (${reason}). Rephrase the question or change the records.` };
  }
  return {
    ok: true,
    text: text.slice(0, 40_000),
    inputTokens: Math.max(0, Math.floor(usage.promptTokenCount ?? 0)),
    outputTokens: Math.max(0, Math.floor((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0))),
    finishReason: candidate?.finishReason ?? "",
  };
}
