// Replicate API client with BYOK support.
// API key disimpan di localStorage (key: "bucici_replicate_key").
// Gunakan FLUX Kontext Pro untuk image-to-image (foto produk → poster iklan).

export const REPLICATE_KEY_STORAGE = "bucici_replicate_key";

export function getReplicateKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(REPLICATE_KEY_STORAGE) || undefined;
}

export function setReplicateKey(key: string) {
  if (typeof window === "undefined") return;
  if (key.trim()) {
    localStorage.setItem(REPLICATE_KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(REPLICATE_KEY_STORAGE);
  }
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
    `Transform this product photo into a professional advertising poster for a ${opts.productLabel} business.`,
    `Visual style: ${opts.styleDescription}.`,
    opts.title ? `Large headline text on the poster: "${opts.title}".` : "",
    opts.tagline ? `Supporting tagline: "${opts.tagline}".` : "",
    opts.cta ? `Prominent call-to-action: "${opts.cta}".` : "",
    opts.contact ? `Contact/promo info at the bottom: "${opts.contact}".` : "",
    opts.customPrompt ? `Extra instructions: ${opts.customPrompt}.` : "",
    "Premium commercial look, ready for social media. Include all text overlays provided.",
  ]
    .filter(Boolean)
    .join(" ");
}

function ratioToFlux(ratio: string): string {
  const map: Record<string, string> = {
    "1:1": "1:1",
    "4:5": "4:5",
    "9:16": "9:16",
    "16:9": "16:9",
  };
  return map[ratio] ?? "1:1";
}

type ReplicatePrediction = {
  status: string;
  output?: string | string[];
  urls?: { get: string };
  error?: string;
};

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gagal mengunduh gambar hasil dari Replicate.");
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function pollPrediction(pollUrl: string, key: string): Promise<string> {
  const maxAttempts = 40; // max ~2 menit
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));

    const res = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Polling error (${res.status})`);

    const pred = (await res.json()) as ReplicatePrediction;

    if (pred.status === "succeeded") {
      const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      if (!outputUrl) throw new Error("Replicate tidak mengembalikan gambar.");
      return fetchImageAsDataUrl(outputUrl);
    }
    if (pred.status === "failed" || pred.status === "canceled") {
      throw new Error(`Generate gagal: ${pred.error ?? "Unknown error"}`);
    }
  }
  throw new Error("Timeout: Generate poster terlalu lama. Coba lagi.");
}

/**
 * Generate advertising poster menggunakan Replicate FLUX Kontext Pro (image-to-image).
 * Membutuhkan Replicate API key milik user (BYOK).
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error(
      "API Key Replicate belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan kunci dari replicate.com/account/api-tokens.",
    );
  }

  const prompt = buildPosterPrompt(opts);

  const response = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt,
          input_image: opts.imageDataUrl,
          aspect_ratio: ratioToFlux(opts.ratio),
          output_format: "png",
          safety_tolerance: 2,
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    const status = response.status;
    if (status === 401)
      throw new Error(
        "API Key Replicate tidak valid. Pastikan kunci Anda benar di replicate.com/account/api-tokens.",
      );
    if (status === 402)
      throw new Error(
        "Akun Replicate Anda belum memiliki kredit. Top-up di replicate.com/account/billing.",
      );
    if (status === 422)
      throw new Error(
        "Input tidak valid. Coba ganti foto produk atau sederhanakan teks prompt.",
      );
    throw new Error(`Replicate error (${status}): ${errText.slice(0, 200)}`);
  }

  const prediction = (await response.json()) as ReplicatePrediction;

  if (prediction.status === "failed") {
    throw new Error(`Generate gagal: ${prediction.error ?? "Unknown error"}`);
  }

  if (prediction.status === "succeeded") {
    const outputUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    if (!outputUrl) throw new Error("Replicate tidak mengembalikan gambar.");
    return fetchImageAsDataUrl(outputUrl);
  }

  // Status masih processing — polling
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) throw new Error("Replicate tidak mengembalikan URL polling.");
  return pollPrediction(pollUrl, key);
}
