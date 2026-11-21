// Phase 5A: prices, limits and the on/off switch. Prices are USD per 1M tokens as published on
// aistudio.google.com on 2026-11-21 (paid tier, standard). Output includes "thinking" tokens,
// which Google bills as output. A model without a known price is refused rather than guessed.

type Price = { input: number; output: number; until?: string };
export const PRICES: Record<string, Price[]> = {
  "gemini-3.8-flash": [{ input: 0.75, output: 3.75, until: "2027-01-01T00:00:00Z" }, { input: 1.5, output: 7.5 }],
  "gemini-3.5-flash-lite": [{ input: 0.3, output: 2.5 }],
};
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const MAX_QUESTION = 2000;
export const MAX_SOURCES = 400;
export const CONTEXT_TOKEN_LIMIT = 30_000;
export const MAX_OUTPUT_TOKENS = 2048;
// Thinking is set to "low"; this allowance is added to the worst case before each request.
export const THINKING_ALLOWANCE = 4096;
export const TIMEOUT_MS = 60_000;
export const HISTORY_TURNS = 6;

export function priceOf(model: string, now = new Date()): { input: number; output: number } | null {
  const list = PRICES[model];
  if (!list) return null;
  return list.find((p) => !p.until || now < new Date(p.until)) ?? null;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number, now = new Date()): number | null {
  const price = priceOf(model, now);
  if (!price) return null;
  return Math.round(((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * 1e6) / 1e6;
}

// What a request could cost at most: the estimated input and the largest possible answer.
export const worstCase = (model: string, inputTokens: number, now = new Date()) =>
  costUsd(model, inputTokens, MAX_OUTPUT_TOKENS + THINKING_ALLOWANCE, now);

export type AiSettings = { enabled: boolean; model: string; monthlyUsd: number; dailyRequests: number; reason: string | null };

// Server only. The assistant is on only with a key AND AI_ENABLED=1 (either one off is the kill switch).
export function aiSettings(env: Record<string, string | undefined> = process.env): AiSettings {
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const number = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : fallback; };
  const monthlyUsd = number(env.AI_MONTHLY_USD, 5);
  const dailyRequests = Math.floor(number(env.AI_DAILY_REQUESTS, 40));
  const reason = env.AI_ENABLED !== "1" ? "The assistant is switched off (AI_ENABLED isn't 1)."
    : !env.GEMINI_API_KEY ? "No Gemini API key is configured."
    : !priceOf(model) ? `No price is known for the model "${model}", so its cost can't be capped.`
    : null;
  return { enabled: reason === null, model, monthlyUsd, dailyRequests, reason };
}

export type CapCheck = { ok: true } | { ok: false; kind: "month" | "day"; message: string };
export function capCheck(settings: AiSettings, monthUsd: number, todayRequests: number, worst: number): CapCheck {
  if (todayRequests >= settings.dailyRequests) {
    return { ok: false, kind: "day", message: `Today's limit of ${settings.dailyRequests} questions is reached. It resets at midnight UTC.` };
  }
  if (monthUsd + worst > settings.monthlyUsd) {
    return { ok: false, kind: "month", message: `This month's AI spending limit ($${settings.monthlyUsd.toFixed(2)}) is reached or this question could pass it. It resets on the 1st (UTC).` };
  }
  return { ok: true };
}

export const usd = (n: number) => (n < 0.01 && n > 0 ? "under $0.01" : `$${n.toFixed(2)}`);
