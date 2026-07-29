// Google Gemini client with BYOK support.
// Priority: user's own key (profile) → VITE_GEMINI_API_KEY (env)
import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";
// Primary: Gemini 2.0 Flash image generation (image-to-image editing)
const GEMINI_IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";
// Fallback: Imagen 3 (text-to-image, available to all AI Studio API keys)
const IMAGEN_MODEL = "imagen-3.0-generate-002";

export function getGeminiKey(): string | undefined {
  const me = currentUser();
  if (me?.geminiApiKey) return me.geminiApiKey;
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return envKey || undefined;
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
  const res = await fetch(`${BASE}/${TEXT_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

/**
 * Build a rich text prompt for the poster.
 */
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
 * Returns base64 data URL or throws with { status } for fallback handling.
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

  const res = await fetch(`${BASE}/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`status:${res.status}`) as Error & { status: number };
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
    const err = new Error(textMsg || "no_image") as Error & { status: number };
    err.status = 0;
    throw err;
  }
  return `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
}

/**
 * Try Imagen 3 text-to-image (stable, available to all AI Studio API keys).
 */
async function tryImagen3(key: string, opts: PosterOptions): Promise<string> {
  // Build an even richer prompt since we don't have the source image here
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
      aspectRatio: opts.ratio === "4:5" ? "4:5" : opts.ratio === "9:16" ? "9:16" : opts.ratio === "16:9" ? "16:9" : "1:1",
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
    if (status === 400) throw new Error("Prompt tidak valid. Coba sederhanakan teks atau ubah prompt tambahan.");
    if (status === 403)
      throw new Error(
        "API Key tidak valid atau tidak memiliki akses. Pastikan key dari Google AI Studio (aistudio.google.com/apikey) dan sudah diaktifkan.",
      );
    throw new Error(`Imagen error (${status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const pred = data?.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error(
      "AI tidak mengembalikan gambar. Coba ubah prompt atau ganti foto produk.",
    );
  }
  return `data:${pred.mimeType ?? "image/png"};base64,${pred.bytesBase64Encoded}`;
}

/**
 * Generate advertising poster.
 * Strategy:
 *  1. Try Gemini 2.0 Flash Preview image generation (image-to-image, best quality).
 *  2. If 404/403 (model not available for this key), fall back to Imagen 3 text-to-image.
 * Returns the result image as a base64 data URL.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error(
      "API Key Gemini belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci dari aistudio.google.com/apikey.",
    );
  }

  // ── Attempt 1: Gemini Flash image generation (image-to-image) ──
  try {
    return await tryGeminiImageModel(key, opts);
  } catch (e) {
    const status = (e as { status?: number }).status;
    // 404 = model not available, 403 = access denied → fall through to Imagen 3
    if (status !== 404 && status !== 403 && status !== 0) {
      // Other errors (400 bad request, 429 quota, etc.) — surface to user
      const status2 = status ?? 0;
      if (status2 === 400)
        throw new Error(
          "Format gambar tidak valid. Coba gunakan gambar JPG/PNG yang lebih sederhana.",
        );
      if (status2 === 429)
        throw new Error("Kuota API Key habis. Coba lagi beberapa saat kemudian.");
      throw e;
    }
    // Fall through to Imagen 3
    console.warn("[gemini] Gemini image model not available (status:", status, "), falling back to Imagen 3");
  }

  // ── Attempt 2: Imagen 3 text-to-image (always available) ──
  return await tryImagen3(key, opts);
}
