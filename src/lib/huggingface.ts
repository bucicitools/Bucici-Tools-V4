// Hugging Face Inference API client with BYOK support.
// API key (token) disimpan di localStorage.
// Model: black-forest-labs/FLUX.1-Kontext-dev (image-to-image, gratis dengan HF token).

export const HF_KEY_STORAGE = "bucici_hf_key";

export function getHFKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(HF_KEY_STORAGE) || undefined;
}

export function setHFKey(key: string) {
  if (typeof window === "undefined") return;
  if (key.trim()) {
    localStorage.setItem(HF_KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(HF_KEY_STORAGE);
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
    "Premium commercial look, ready for social media. Keep the product clearly visible. Include all text overlays provided.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Convert base64 data URL to a Blob for multipart upload */
function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return { blob: new Blob([arr], { type: mimeType }), mimeType };
}

type HFImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

/**
 * Generate advertising poster menggunakan Hugging Face FLUX.1-Kontext-dev (image-to-image).
 * Membutuhkan HF token gratis dari huggingface.co/settings/tokens.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getHFKey();
  if (!key) {
    throw new Error(
      "Token Hugging Face belum diatur. Buka Pengaturan → Kunci AI Pribadi dan masukkan token dari huggingface.co/settings/tokens.",
    );
  }

  const prompt = buildPosterPrompt(opts);
  const { blob, mimeType } = dataUrlToBlob(opts.imageDataUrl);

  const form = new FormData();
  form.append("image", blob, `product.${mimeType.split("/")[1] ?? "jpg"}`);
  form.append("prompt", prompt);
  form.append("model", "black-forest-labs/FLUX.1-Kontext-dev");
  form.append("response_format", "b64_json");

  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Kontext-dev/v1/images/edits",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    const status = response.status;
    if (status === 401)
      throw new Error(
        "Token Hugging Face tidak valid. Pastikan token Anda benar di huggingface.co/settings/tokens.",
      );
    if (status === 403)
      throw new Error(
        "Token Anda tidak punya akses ke model ini. Buat token baru dengan tipe 'Read' di huggingface.co/settings/tokens.",
      );
    if (status === 429)
      throw new Error(
        "Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.",
      );
    if (status === 503)
      throw new Error(
        "Model sedang dimuat. Tunggu 20 detik lalu coba lagi.",
      );
    throw new Error(`Hugging Face error (${status}): ${errText.slice(0, 200)}`);
  }

  const result = (await response.json()) as HFImageResponse;
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Hugging Face tidak mengembalikan gambar. Coba lagi.");

  return `data:image/png;base64,${b64}`;
}
