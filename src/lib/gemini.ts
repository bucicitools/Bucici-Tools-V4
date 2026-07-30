// Google Gemini client with BYOK + key rotation support.
//
// Key storage: localStorage keys "bucici_gemini_key_1", "_2", "_3"
// Key format detection:
//   AQ.Ab... → x-goog-api-key header
//   AIzaSy... → ?key= query param
//
// Key rotation: if a key hits 429, automatically rotate to the next key.

import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";
// Primary model, fallback to gemini-2.5-flash-image if 404
const IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";
const IMAGE_MODEL_FALLBACK = "gemini-2.5-flash-image";

export const GEMINI_KEY_SLOTS = ["bucici_gemini_key_1", "bucici_gemini_key_2", "bucici_gemini_key_3"] as const;
// Legacy key (single key, old format)
const LS_KEY_LEGACY = "bucici_gemini_key";

// ─── Key management ───────────────────────────────────────────────────────────

/** Get all saved keys as an array (non-empty only) */
export function getAllGeminiKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (const slot of GEMINI_KEY_SLOTS) {
    const k = localStorage.getItem(slot)?.trim();
    if (k) keys.push(k);
  }
  // Legacy single key fallback
  if (keys.length === 0) {
    const legacy = localStorage.getItem(LS_KEY_LEGACY)?.trim();
    if (legacy) keys.push(legacy);
    // Also check store
    const me = currentUser();
    if (!legacy && me?.geminiApiKey?.trim()) keys.push(me.geminiApiKey.trim());
    // Env var
    const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!legacy && !me?.geminiApiKey && envKey?.trim()) keys.push(envKey.trim());
  }
  return keys;
}

/** Get the first available key (for display/check purposes) */
export function getGeminiKey(): string | undefined {
  return getAllGeminiKeys()[0];
}

/** Save a key to a specific slot (1-indexed) */
export function saveGeminiKeySlot(slot: 1 | 2 | 3, key: string): void {
  if (typeof window === "undefined") return;
  const lsKey = `bucici_gemini_key_${slot}`;
  if (key.trim()) localStorage.setItem(lsKey, key.trim());
  else localStorage.removeItem(lsKey);
}

/** Read a key from a specific slot (1-indexed) */
export function readGeminiKeySlot(slot: 1 | 2 | 3): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`bucici_gemini_key_${slot}`) ?? "";
}

/** Legacy single-key save — also saves to slot 1 */
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

/** Legacy single-key read */
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

// ─── Sleep helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Text generation ──────────────────────────────────────────────────────────

export async function askGemini(prompt: string, system?: string): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    return "⚠️ Belum ada Gemini API Key. Buka Ruang Pengaturan → 'Kunci AI Pribadi' untuk mengaktifkan fitur AI.";
  }
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { role: "system", parts: [{ text: system }] } } : {}),
  };
  const { url, headers } = buildRequest(`${BASE}/${TEXT_MODEL}:generateContent`, key);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  return text || "(kosong)";
}

// ─── Poster options ───────────────────────────────────────────────────────────

export interface PosterOptions {
  imageDataUrl: string;
  title: string;
  tagline: string;
  cta: string;
  contact: string;
  styleLabel: string;
  styleDescription: string;
  productLabel: string;
  ratio: string;
  customPrompt?: string;
}

// ─── Main entry point with key rotation ──────────────────────────────────────

/**
 * Generate advertising poster via Gemini image generation model.
 * Foto produk asli dikirim ke Gemini → Gemini transform jadi poster profesional.
 * Key rotation: if one key hits 429, automatically tries the next key.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const keys = getAllGeminiKeys();
  if (keys.length === 0) {
    throw new Error(
      "API Key Gemini belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci dari aistudio.google.com/apikey.",
    );
  }

  const match = opts.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const [, mimeType, base64Data] = match;

  const prompt = [
    `Transform this product photo into a professional advertising poster for a ${opts.productLabel} business.`,
    `Visual style: ${opts.styleDescription}.`,
    `Aspect ratio: ${opts.ratio}.`,
    opts.title ? `Main headline text on the poster: "${opts.title}".` : "",
    opts.tagline ? `Supporting tagline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action text: "${opts.cta}".` : "",
    opts.contact ? `Contact/info at bottom: "${opts.contact}".` : "",
    opts.customPrompt ? `Extra instructions: ${opts.customPrompt}.` : "",
    "Keep the product as the hero. Make it look premium and ready for social media. Output as a complete poster image with text overlays.",
  ]
    .filter(Boolean)
    .join(" ");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  // Try each key in rotation
  let lastError = "";
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const keyLabel = keys.length > 1 ? ` (key ${i + 1}/${keys.length})` : "";

    // Try primary model
    let modelToUse = IMAGE_MODEL;
    let { url, headers } = buildRequest(`${BASE}/${modelToUse}:generateContent`, key);
    let res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

    // If primary model 404, try fallback model
    if (res.status === 404) {
      modelToUse = IMAGE_MODEL_FALLBACK;
      ({ url, headers } = buildRequest(`${BASE}/${modelToUse}:generateContent`, key));
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    }

    // 429 on this key → try next key immediately (no long wait)
    if (res.status === 429) {
      lastError = `Key ${i + 1} terkena rate limit`;
      if (i < keys.length - 1) {
        // Small delay before next key (2 seconds)
        await sleep(2000);
        continue;
      }
      // All keys exhausted
      throw new Error(
        `Semua API key kena rate limit${keyLabel}. Tunggu beberapa menit lalu coba lagi, atau tambah key cadangan di Pengaturan.`,
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      const status = res.status;
      if (status === 400)
        throw new Error("Format gambar atau prompt tidak valid. Coba gambar produk yang lebih jelas.");
      if (status === 403)
        throw new Error(
          `API Key tidak valid atau tidak memiliki akses${keyLabel}. Pastikan key sudah benar di Pengaturan.`,
        );
      if (status === 404)
        throw new Error(
          "Model image generation tidak tersedia. Coba buat API key baru di aistudio.google.com/apikey.",
        );
      throw new Error(`Gemini error (${status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> =
      data?.candidates?.[0]?.content?.parts ?? [];

    const imagePart = parts.find((p) => p.inline_data?.data);
    if (!imagePart?.inline_data) {
      const textMsg = parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join(" ");
      throw new Error(
        textMsg || "AI tidak mengembalikan gambar. Coba gambar produk yang berbeda atau ubah style.",
      );
    }

    return `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
  }

  throw new Error(lastError || "Gagal generate poster. Coba lagi.");
}
