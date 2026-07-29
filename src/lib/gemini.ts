// Google Gemini client with BYOK support.
//
// Key storage: localStorage key "bucici_gemini_key" (simple, reliable, no store dependency)
// Key format detection:
//   AQ.Ab... → x-goog-api-key header
//   AIzaSy... → ?key= query param
//
// Falls back to currentUser().geminiApiKey or VITE_GEMINI_API_KEY for backward compat.
import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";
// Model image generation terbaru (pengganti gemini-2.0-flash-preview-image-generation yang sudah deprecated Nov 2025)
const IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";
const LS_KEY = "bucici_gemini_key";

// ─── Key management ───────────────────────────────────────────────────────────

export function getGeminiKey(): string | undefined {
  // 1. Direct localStorage (set by saveGeminiKeyLocal)
  if (typeof window !== "undefined") {
    const lsKey = localStorage.getItem(LS_KEY);
    if (lsKey?.trim()) return lsKey.trim();
  }
  // 2. Store (legacy hydration path)
  const me = currentUser();
  if (me?.geminiApiKey?.trim()) return me.geminiApiKey.trim();
  // 3. Env var fallback
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return envKey?.trim() || undefined;
}

/** Save key directly to localStorage — instant, no reload needed */
export function saveGeminiKeyLocal(key: string): void {
  if (typeof window === "undefined") return;
  if (key.trim()) localStorage.setItem(LS_KEY, key.trim());
  else localStorage.removeItem(LS_KEY);
}

/** Read key from localStorage (for pre-filling input in settings) */
export function readGeminiKeyLocal(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_KEY) ?? "";
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

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate advertising poster via Gemini image generation model directly.
 * Foto produk asli dikirim ke Gemini → Gemini transform jadi poster profesional.
 * Model: gemini-2.0-flash-exp-image-generation (current, replaces deprecated preview model)
 * Retries once on 429 after 65 seconds.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
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

  const { url, headers } = buildRequest(`${BASE}/${IMAGE_MODEL}:generateContent`, key);
  const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };

  // First attempt
  let res = await fetch(url, init);

  // Auto-retry once on 429 (rate limit) — wait 65s for quota to reset
  if (res.status === 429) {
    await sleep(65_000);
    res = await fetch(url, init);
  }

  // If exp model also fails with 404, try gemini-2.5-flash-image as final fallback
  if (res.status === 404) {
    const fallbackModel = "gemini-2.5-flash-image";
    const { url: url2, headers: headers2 } = buildRequest(
      `${BASE}/${fallbackModel}:generateContent`,
      key,
    );
    res = await fetch(url2, { method: "POST", headers: headers2, body: JSON.stringify(body) });
  }

  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    if (status === 400)
      throw new Error(
        "Format gambar atau prompt tidak valid. Coba gambar produk yang lebih jelas.",
      );
    if (status === 403)
      throw new Error(
        "API Key tidak valid atau tidak memiliki akses. Pastikan key sudah benar di Pengaturan.",
      );
    if (status === 429)
      throw new Error(
        "Rate limit Gemini masih aktif. Tunggu beberapa menit lalu coba lagi, atau coba besok jika kuota harian habis.",
      );
    if (status === 404)
      throw new Error(
        "Model image generation tidak tersedia untuk key ini. Coba buat API key baru di aistudio.google.com/apikey.",
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
