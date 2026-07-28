// Google Gemini client with BYOK support.
// Priority: user's own key (profile) → VITE_GEMINI_API_KEY (env, for whitelisted accounts)
import { currentUser } from "@/lib/store";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-2.0-flash";
// gemini-2.0-flash-exp supports native image generation (responseModalities: ["IMAGE", "TEXT"])
// This is the most widely available model for image generation as of 2025
const IMAGE_MODEL = "gemini-2.0-flash-exp";

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
 * Generate advertising poster via Gemini image generation, directly from the browser.
 * Uses gemini-2.0-flash-exp with responseModalities: ["IMAGE", "TEXT"] for image-to-image.
 * Returns the result image as a base64 data URL (data:image/png;base64,...).
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error(
      "API Key Gemini belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci Anda.",
    );
  }

  // Extract mime type and raw base64 from data URL
  const match = opts.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const [, mimeType, base64Data] = match;

  const prompt = [
    `Transform this product photo into a professional advertising poster for a ${opts.productLabel} business.`,
    `Visual style: ${opts.styleDescription}.`,
    `Aspect ratio: ${opts.ratio}.`,
    opts.title ? `Main headline text on the poster: "${opts.title}".` : "",
    opts.tagline ? `Supporting tagline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action button or text: "${opts.cta}".` : "",
    opts.contact ? `Contact/additional info at bottom: "${opts.contact}".` : "",
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
      // IMAGE must be listed — this tells the model to output an image
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const res = await fetch(`${BASE}/${IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    if (status === 400)
      throw new Error(
        "Format gambar atau prompt tidak valid. Coba gambar lain atau sederhanakan prompt.",
      );
    if (status === 403)
      throw new Error(
        "API Key tidak valid atau tidak memiliki akses ke model image generation. Pastikan API Key dari Google AI Studio (bukan dari Google Cloud).",
      );
    if (status === 404)
      throw new Error(
        "Model image generation tidak tersedia untuk API Key ini. Pastikan API Key sudah aktif di aistudio.google.com dan mendukung model Gemini 2.0.",
      );
    if (status === 429)
      throw new Error("Kuota API Key habis atau terlalu banyak request. Coba lagi sebentar.");
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
      textMsg ||
        "AI tidak mengembalikan gambar. Model mungkin tidak mendukung image output untuk prompt ini. Coba gambar produk yang berbeda.",
    );
  }

  return `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
}
