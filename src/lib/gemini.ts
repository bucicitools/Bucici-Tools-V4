// Google Gemini client with BYOK support.
// Priority: user's own key (profile) → VITE_GEMINI_API_KEY (env)
//
// Key format:
//   AQ.Ab... → newer AI Studio key, sent via x-goog-api-key header
//   AIzaSy... → classic API key, sent as ?key= query param
import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";
const IMAGEN_MODEL = "imagen-3.0-generate-002";

export function getGeminiKey(): string | undefined {
  const me = currentUser();
  if (me?.geminiApiKey) return me.geminiApiKey;
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return envKey || undefined;
}

/**
 * Build fetch URL and headers depending on key format.
 * AQ.Ab... → x-goog-api-key header (no query param)
 * AIzaSy... → ?key= query param (classic)
 */
function buildRequest(endpoint: string, key: string): { url: string; headers: Record<string, string> } {
  const isNewFormat = key.startsWith("AQ.");
  const url = isNewFormat ? endpoint : `${endpoint}?key=${key}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isNewFormat) headers["x-goog-api-key"] = key;
  return { url, headers };
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

/**
 * Analyze a product image and return a detailed visual description in English.
 * Uses Gemini Flash text (multimodal) which is FREE (~1500 req/day, no billing needed).
 * The description is then used as a Pollinations prompt for accurate image generation.
 */
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
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    if (status === 401) throw new Error("API Key tidak valid. Pastikan key sudah benar di Pengaturan.");
    if (status === 429) throw new Error("Kuota API Key habis. Coba lagi beberapa saat.");
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

/**
 * Build Pollinations FLUX prompt using Gemini's visual description as the product context.
 */
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

/**
 * Generate poster via Pollinations FLUX (free, no key required).
 */
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

/**
 * Try Imagen 3 text-to-image (requires billing, kept as last resort).
 */
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

  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    if (status === 403)
      throw new Error("Imagen 3 membutuhkan billing. Menggunakan Pollinations sebagai fallback.");
    throw new Error(`Imagen error (${status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const pred = data?.predictions?.[0];
  if (!pred?.bytesBase64Encoded) throw new Error("no_image");
  return `data:${pred.mimeType ?? "image/png"};base64,${pred.bytesBase64Encoded}`;
}

/**
 * Generate advertising poster — Hybrid approach:
 * 1. Gemini Flash text (FREE) reads photo → generates accurate visual description
 * 2. Pollinations FLUX renders poster using that description as prompt
 * 3. Falls back to Imagen 3 if available (requires billing)
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error(
      "API Key Gemini belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci dari aistudio.google.com/apikey.",
    );
  }

  // Step 1: Gemini reads the product photo (text/multimodal, FREE)
  const productDescription = await analyzeProductImage(opts.imageDataUrl);

  // Step 2: Build accurate prompt using Gemini's description
  const prompt = buildPollinationsPrompt(productDescription, opts);

  // Step 3: Try Imagen 3 first (higher quality), fall back to Pollinations
  try {
    return await tryImagen3(key, opts, productDescription);
  } catch {
    // Imagen not available or no billing → use Pollinations (free)
  }

  return await generateWithPollinations(prompt, opts);
}
