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
const IMAGEN_MODEL = "imagen-3.0-generate-002";
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

function buildRequest(endpoint: string, key: string): { url: string; headers: Record<string, string> } {
  const isNewFormat = key.startsWith("AQ.");
  const url = isNewFormat ? endpoint : `${endpoint}?key=${key}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isNewFormat) headers["x-goog-api-key"] = key;
  return { url, headers };
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with one automatic retry on HTTP 429.
 * Gemini Free Tier enforces per-minute rate limits that reset after ~60 seconds.
 * Retrying once after a short wait resolves most transient 429s without user action.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retryDelayMs = 65_000,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429) return res;

  // First attempt hit rate limit — wait then retry once
  await sleep(retryDelayMs);
  return fetch(url, init);
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
  const res = await fetchWithRetry(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("Rate limit Gemini. Tunggu 1 menit lalu coba lagi.");
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  return text || "(kosong)";
}

// ─── Product image analysis ───────────────────────────────────────────────────

export async function analyzeProductImage(imageDataUrl: string): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error("API Key Gemini belum diatur.");

  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const [, mimeType, base64Data] = match;

  const prompt = `Analyze this product photo and describe it in detail for use as an AI image generation prompt.
Focus on: exact product appearance, colors, textures, shapes, materials, presentation style, background elements.
Be precise and descriptive. Write in English. 2-3 sentences maximum. Do NOT mention brand names.
Example output: "Crispy golden-brown chicken skin skewers on bamboo sticks, glistening with oil, arranged on a white ceramic plate with a light background."`;

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
  };

  const { url, headers } = buildRequest(`${BASE}/${TEXT_MODEL}:generateContent`, key);

  // fetchWithRetry handles transient 429 rate limits automatically (waits 65s then retries once)
  const res = await fetchWithRetry(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    if (status === 401) throw new Error("API Key tidak valid. Pastikan key sudah benar di Pengaturan → Kunci AI Pribadi.");
    if (status === 429) throw new Error("Rate limit Gemini masih aktif setelah retry. Tunggu beberapa menit lalu coba lagi.");
    throw new Error(`Gemini analyze error (${status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";

  if (!text) throw new Error("Gemini tidak dapat membaca foto produk. Coba foto yang lebih jelas.");
  return text.trim();
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

export function buildPollinationsPrompt(productDescription: string, opts: PosterOptions): string {
  return [
    `Professional advertising poster for a ${opts.productLabel} business.`,
    `Featured product: ${productDescription}`,
    `Visual style: ${opts.styleDescription}.`,
    opts.title ? `Poster headline text: "${opts.title}".` : "",
    opts.tagline ? `Tagline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action text: "${opts.cta}".` : "",
    opts.contact ? `Footer info: "${opts.contact}".` : "",
    opts.customPrompt ? opts.customPrompt : "",
    "High quality commercial advertising poster, premium look, ready for social media, includes text overlays.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Pollinations renderer ────────────────────────────────────────────────────

async function generateWithPollinations(prompt: string, opts: PosterOptions): Promise<string> {
  const ratioMap: Record<string, { w: number; h: number }> = {
    "1:1":  { w: 1024, h: 1024 },
    "4:5":  { w: 896,  h: 1120 },
    "9:16": { w: 768,  h: 1365 },
    "16:9": { w: 1365, h: 768  },
  };
  const { w, h } = ratioMap[opts.ratio] ?? { w: 1024, h: 1024 };
  const seed = Math.floor(Math.random() * 999999);
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true&model=flux`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations error (${res.status}). Coba lagi.`);

  const blob = await res.blob();
  if (!blob.size) throw new Error("Pollinations tidak mengembalikan gambar. Coba lagi.");

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Imagen 3 (billing required) ─────────────────────────────────────────────

async function tryImagen3(key: string, opts: PosterOptions, productDescription: string): Promise<string> {
  const prompt = buildPollinationsPrompt(productDescription, opts);
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio:
        opts.ratio === "4:5" ? "4:5" :
        opts.ratio === "9:16" ? "9:16" :
        opts.ratio === "16:9" ? "16:9" : "1:1",
      safetyFilterLevel: "block_some",
      personGeneration: "allow_adult",
    },
  };

  const { url, headers } = buildRequest(`${BASE}/${IMAGEN_MODEL}:predict`, key);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) throw new Error(`imagen_unavailable`);

  const data = await res.json();
  const pred = data?.predictions?.[0];
  if (!pred?.bytesBase64Encoded) throw new Error("no_image");
  return `data:${pred.mimeType ?? "image/png"};base64,${pred.bytesBase64Encoded}`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Hybrid: Gemini text reads photo → Pollinations FLUX renders poster.
 * Gemini text (multimodal) is FREE ~1500 req/day, no billing needed.
 * Auto-retries once on 429 rate limit (waits 65s) before failing.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error(
      "API Key Gemini belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci dari aistudio.google.com/apikey.",
    );
  }

  // Step 1: Gemini reads product photo (text/multimodal — FREE, with auto-retry on 429)
  const productDescription = await analyzeProductImage(opts.imageDataUrl);

  // Step 2: Build accurate prompt
  const prompt = buildPollinationsPrompt(productDescription, opts);

  // Step 3: Try Imagen 3 first, fall back to Pollinations (free)
  try {
    return await tryImagen3(key, opts, productDescription);
  } catch {
    // Imagen not available → use Pollinations
  }

  return await generateWithPollinations(prompt, opts);
}
