// Google Gemini client with BYOK support.
// Priority: user's own key (profile) → VITE_GEMINI_API_KEY (env)
//
// Supports two API key formats:
//   - AIzaSy...  (Standard API Key) → sent as ?key= query parameter
//   - AQ....     (Auth Key / OAuth token) → sent as Authorization: Bearer header
import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";
const GEMINI_IMAGE_MODEL = "gemini-2.0-flash";
const IMAGEN_MODEL = "imagen-3.0-generate-002";

export function getGeminiKey(): string | undefined {
  const me = currentUser();
  if (me?.geminiApiKey) return me.geminiApiKey;
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return envKey || undefined;
}

/**
 * Detect whether a key is the new Auth Key format (AQ. prefix).
 * Auth Keys use Bearer token auth, not ?key= query param.
 */
function isAuthKey(key: string): boolean {
  return key.startsWith("AQ.");
}

/**
 * Build fetch URL and headers for a Gemini API call based on key format.
 * - Standard key (AIzaSy...): appends ?key= to URL, no auth header
 * - Auth key (AQ...): uses Authorization: Bearer header, no ?key= in URL
 */
function buildGeminiRequest(url: string, key: string): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isAuthKey(key)) {
    return { url, headers: { ...headers, Authorization: `Bearer ${key}` } };
  }
  const sep = url.includes("?") ? "&" : "?";
  return { url: `${url}${sep}key=${key}`, headers };
}

export async function askGemini(prompt: string, system?: string): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    return "⚠️ Belum ada Gemini API Key. Buka Ruang Pengaturan → 'Kunci AI Pribadi' untuk mengaktifkan fitur AI.";
  }
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { role: "system", parts: [{ text: system }] } } : {}),
  };
  const { url, headers } = buildGeminiRequest(`${BASE}/${TEXT_MODEL}:generateContent`, key);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
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

export interface PosterOptions {
  /** Source product image as base64 data URL (data:image/...;base64,...) */
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

function buildPosterPrompt(opts: PosterOptions): string {
  return [
    `Create a professional advertising poster for a ${opts.productLabel} business.`,
    `Visual style: ${opts.styleDescription}.`,
    `Aspect ratio target: ${opts.ratio}.`,
    opts.title ? `Large headline text on the poster: "${opts.title}".` : "",
    opts.tagline ? `Supporting tagline below headline: "${opts.tagline}".` : "",
    opts.cta ? `Prominent call-to-action text: "${opts.cta}".` : "",
    opts.contact ? `Contact or promo info at the bottom: "${opts.contact}".` : "",
    opts.customPrompt ? `Extra instructions: ${opts.customPrompt}.` : "",
    "Make it look premium, ready for social media. Include text overlays with the provided copy.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Try Gemini 2.0 Flash image generation (image-to-image).
 * Supports both AIzaSy (query param) and AQ. (Bearer header) key formats.
 */
async function tryGeminiImageModel(key: string, opts: PosterOptions): Promise<string> {
  const match = opts.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const [, mimeType, base64Data] = match;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: buildPosterPrompt(opts) },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  };

  const { url, headers } = buildGeminiRequest(`${BASE}/${GEMINI_IMAGE_MODEL}:generateContent`, key);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`status:${res.status}:${errText.slice(0, 200)}`) as Error & { status: number };
    err.status = res.status;
    throw err;
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
    if (
      textMsg?.toLowerCase().includes("tidak tersedia") ||
      textMsg?.toLowerCase().includes("not available") ||
      textMsg?.toLowerCase().includes("cannot generate")
    ) {
      const err = new Error(textMsg) as Error & { status: number };
      err.status = 403;
      throw err;
    }
    const err = new Error(textMsg || "no_image") as Error & { status: number };
    err.status = 0;
    throw err;
  }
  return `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
}

/**
 * Try Imagen 3 text-to-image.
 * Note: Imagen 3 only supports AIzaSy standard keys with billing enabled.
 * AQ. Auth Keys are not supported by Imagen 3.
 */
async function tryImagen3(key: string, opts: PosterOptions): Promise<string> {
  // Imagen 3 doesn't support Auth Key (AQ.) format — skip immediately
  if (isAuthKey(key)) {
    throw new Error(
      "Imagen 3 tidak mendukung format Auth Key (AQ...). Gunakan Gemini API Key format AIzaSy dari Google Cloud Console → APIs & Services → Credentials.",
    );
  }

  const prompt = [
    `Professional advertising poster for a ${opts.productLabel} product.`,
    `Design style: ${opts.styleDescription}.`,
    `Aspect ratio: ${opts.ratio}.`,
    opts.title ? `Headline: "${opts.title}".` : "",
    opts.tagline ? `Tagline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action: "${opts.cta}".` : "",
    opts.contact ? `Footer info: "${opts.contact}".` : "",
    opts.customPrompt ? opts.customPrompt : "",
    "High quality, ready for social media, includes text overlays, premium commercial look.",
  ]
    .filter(Boolean)
    .join(" ");

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio:
        opts.ratio === "4:5"
          ? "4:5"
          : opts.ratio === "9:16"
            ? "9:16"
            : opts.ratio === "16:9"
              ? "16:9"
              : "1:1",
      safetyFilterLevel: "block_some",
      personGeneration: "allow_adult",
    },
  };

  const res = await fetch(`${BASE}/${IMAGEN_MODEL}:predict?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    if (status === 400)
      throw new Error("Prompt tidak valid. Coba sederhanakan teks atau ubah prompt tambahan.");
    if (status === 403)
      throw new Error(
        "API Key tidak memiliki akses ke Imagen 3. Aktifkan billing di Google Cloud Console atau gunakan key lain.",
      );
    throw new Error(`Imagen error (${status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const pred = data?.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error("AI tidak mengembalikan gambar. Coba ubah prompt atau ganti foto produk.");
  }
  return `data:${pred.mimeType ?? "image/png"};base64,${pred.bytesBase64Encoded}`;
}

/**
 * Generate advertising poster.
 *
 * Strategy for AIzaSy keys:
 *   1. Gemini 2.0 Flash image gen → fallback to Imagen 3 on 400/403/404/no-image
 *
 * Strategy for AQ. Auth Keys:
 *   1. Gemini 2.0 Flash image gen with Bearer auth (Imagen 3 not supported for AQ.)
 *      If this fails, show a clear error explaining AQ. limitations.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error(
      "API Key Gemini belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci dari aistudio.google.com/apikey.",
    );
  }

  // ── Attempt 1: Gemini 2.0 Flash image generation ──
  try {
    return await tryGeminiImageModel(key, opts);
  } catch (e) {
    const status = (e as { status?: number }).status;
    const shouldFallback = status === 400 || status === 403 || status === 404 || status === 0;

    if (!shouldFallback) {
      if (status === 429)
        throw new Error("Kuota API Key habis. Coba lagi beberapa saat kemudian.");
      throw e;
    }

    // AQ. keys: Imagen 3 tidak tersedia, langsung tampilkan error yang informatif
    if (isAuthKey(key)) {
      throw new Error(
        "Gemini Auth Key (AQ...) belum mendukung image generation secara penuh. " +
        "Untuk generate poster, gunakan API Key standar (format AIzaSy...) dari " +
        "Google Cloud Console → APIs & Services → Credentials → Create Credentials → API Key. " +
        "Atau aktifkan billing di Google Cloud Console agar model image generation dapat diakses.",
      );
    }

    console.warn("[gemini] Gemini image model fallback (status:", status, "), trying Imagen 3");
  }

  // ── Attempt 2: Imagen 3 (only for AIzaSy keys) ──
  try {
    return await tryImagen3(key, opts);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("tidak memiliki akses") || msg.includes("403")) {
      throw new Error(
        "API Key ini belum mendukung image generation. Aktifkan billing di Google Cloud Console " +
        "atau buat key baru di aistudio.google.com/apikey.",
      );
    }
    throw e;
  }
}
