// Google Gemini client — Hybrid Key System
//
// Priority order:
//   1. User's personal key from localStorage (bucici_gemini_key_1/_2/_3)
//   2. Developer's centralized key (VITE_GEMINI_API_KEY)
//
// Key format detection:
//   AQ.Ab... → x-goog-api-key header  (new Google Auth Key format, 2026+)
//   AIzaSy... → ?key= query param     (legacy format, still works)
//
// On 429 from centralized key → throw special error to prompt user to add personal key
// On 429 from personal key    → friendly rate limit message

import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";

export const GEMINI_KEY_SLOTS = ["bucici_gemini_key_1", "bucici_gemini_key_2", "bucici_gemini_key_3"] as const;
const LS_KEY_LEGACY = "bucici_gemini_key";

// ─── Key management ───────────────────────────────────────────────────────────

/** Returns all personal keys saved by the user (localStorage). */
export function getPersonalKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (const slot of GEMINI_KEY_SLOTS) {
    const k = localStorage.getItem(slot)?.trim();
    if (k) keys.push(k);
  }
  // Legacy single-slot support
  if (keys.length === 0) {
    const legacy = localStorage.getItem(LS_KEY_LEGACY)?.trim();
    if (legacy) keys.push(legacy);
    const me = currentUser();
    if (!legacy && me?.geminiApiKey?.trim()) keys.push(me.geminiApiKey.trim());
  }
  return keys;
}

/** Returns developer centralized key from env (VITE_GEMINI_API_KEY). */
function getDevKey(): string | undefined {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return envKey?.trim() || undefined;
}

/** Returns all available keys: personal keys first, then dev key as fallback. */
export function getAllGeminiKeys(): Array<{ key: string; isPersonal: boolean }> {
  const personal = getPersonalKeys().map((k) => ({ key: k, isPersonal: true }));
  if (personal.length > 0) return personal;
  const dev = getDevKey();
  if (dev) return [{ key: dev, isPersonal: false }];
  return [];
}

/** Returns the primary key (for UI checks). */
export function getGeminiKey(): string | undefined {
  return getAllGeminiKeys()[0]?.key;
}

export function hasPersonalKey(): boolean {
  return getPersonalKeys().length > 0;
}

export function saveGeminiKeySlot(slot: 1 | 2 | 3, key: string): void {
  if (typeof window === "undefined") return;
  const lsKey = `bucici_gemini_key_${slot}`;
  if (key.trim()) localStorage.setItem(lsKey, key.trim());
  else localStorage.removeItem(lsKey);
}

export function readGeminiKeySlot(slot: 1 | 2 | 3): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`bucici_gemini_key_${slot}`) ?? "";
}

export function saveGeminiKeyLocal(key: string): void {
  if (typeof window === "undefined") return;
  if (key.trim()) {
    localStorage.setItem(LS_KEY_LEGACY, key.trim());
    localStorage.setItem(GEMINI_KEY_SLOTS[0], key.trim());
  } else {
    localStorage.removeItem(LS_KEY_LEGACY);
    localStorage.removeItem(GEMINI_KEY_SLOTS[0]);
  }
}

export function readGeminiKeyLocal(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem(GEMINI_KEY_SLOTS[0]) ??
    localStorage.getItem(LS_KEY_LEGACY) ??
    ""
  );
}

// ─── Request builder ──────────────────────────────────────────────────────────

function buildRequest(
  endpoint: string,
  key: string,
): { url: string; headers: Record<string, string> } {
  const isNewFormat = key.startsWith("AQ.");
  const url = isNewFormat ? endpoint : `${endpoint}?key=${key}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isNewFormat) headers["x-goog-api-key"] = key;
  return { url, headers };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Special error types ──────────────────────────────────────────────────────

export class GeminiQuotaExhaustedError extends Error {
  readonly isPersonalKey: boolean;
  constructor(isPersonalKey: boolean) {
    super(
      isPersonalKey
        ? "API key pribadi Anda kena rate limit. Tunggu beberapa menit lalu coba lagi."
        : "Server AI sedang padat. Masukkan API key pribadi di Pengaturan → Kunci AI Pribadi untuk tetap bisa generate.",
    );
    this.name = "GeminiQuotaExhaustedError";
    this.isPersonalKey = isPersonalKey;
  }
}

// ─── Text generation with key rotation ───────────────────────────────────────

export async function askGemini(prompt: string, system?: string): Promise<string> {
  const keys = getAllGeminiKeys();

  if (keys.length === 0) {
    return "⚠️ Fitur AI belum tersedia. Hubungi admin atau masukkan API key pribadi di Pengaturan → Kunci AI Pribadi.";
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { role: "system", parts: [{ text: system }] } } : {}),
  };

  for (let i = 0; i < keys.length; i++) {
    const { key, isPersonal } = keys[i];
    const { url, headers } = buildRequest(`${BASE}/${TEXT_MODEL}:generateContent`, key);

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

    if (res.status === 429) {
      // If more keys available, wait briefly and try next
      if (i < keys.length - 1) {
        await sleep(1000);
        continue;
      }
      // All keys exhausted
      throw new GeminiQuotaExhaustedError(isPersonal);
    }

    if (!res.ok) {
      const t = await res.text();
      const status = res.status;
      if (status === 403) throw new Error("API key tidak valid atau tidak memiliki akses. Cek kembali key di Pengaturan.");
      throw new Error(`Gemini error ${status}: ${t.slice(0, 200)}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    return text || "(kosong)";
  }

  throw new Error("Gagal menghubungi AI. Coba lagi.");
}
