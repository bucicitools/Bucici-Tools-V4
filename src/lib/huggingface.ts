// Hugging Face Inference API client — image-to-image BYOK.
// Model: timbrooks/instruct-pix2pix (gratis dengan HF token standar).
// Token disimpan di localStorage.

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
    opts.title ? `Add large headline text: "${opts.title}".` : "",
    opts.tagline ? `Add tagline: "${opts.tagline}".` : "",
    opts.cta ? `Add call-to-action button: "${opts.cta}".` : "",
    opts.contact ? `Add contact info at the bottom: "${opts.contact}".` : "",
    opts.customPrompt ? `Extra instructions: ${opts.customPrompt}.` : "",
    "Premium commercial advertising poster, keep product clearly visible.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Convert base64 data URL to raw binary Uint8Array */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const binary = atob(match[1]);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

/**
 * Generate poster iklan menggunakan HF Inference API.
 * Model: timbrooks/instruct-pix2pix — image-to-image, gratis dengan token HF standar.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getHFKey();
  if (!key) {
    throw new Error(
      "Token Hugging Face belum diatur. Buka Pengaturan \u2192 Kunci AI Pribadi dan masukkan token dari huggingface.co/settings/tokens.",
    );
  }

  const prompt = buildPosterPrompt(opts);
  const imageBytes = dataUrlToBytes(opts.imageDataUrl);

  // instruct-pix2pix accepts JSON with base64 inputs
  const base64Image = opts.imageDataUrl.replace(/^data:[^;]+;base64,/, "");

  const response = await fetch(
    "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Wait-For-Model": "true",
      },
      body: JSON.stringify({
        inputs: base64Image,
        parameters: {
          prompt,
          num_inference_steps: 20,
          image_guidance_scale: 1.5,
          guidance_scale: 7.5,
        },
      }),
    },
  );

  // Jika masih loading (503), tunggu dan retry sekali
  if (response.status === 503) {
    await new Promise((r) => setTimeout(r, 20000));
    return generatePosterImage(opts);
  }

  if (!response.ok) {
    const errText = await response.text();
    const status = response.status;
    if (status === 401)
      throw new Error(
        "Token Hugging Face tidak valid. Pastikan token Anda benar di huggingface.co/settings/tokens.",
      );
    if (status === 403)
      throw new Error(
        "Token tidak punya akses ke model ini. Buat token baru bertipe \u2018Read\u2019 di huggingface.co/settings/tokens.",
      );
    if (status === 429)
      throw new Error("Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.");
    throw new Error(`Hugging Face error (${status}): ${errText.slice(0, 300)}`);
  }

  // Response is binary image
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca hasil gambar dari Hugging Face."));
    reader.readAsDataURL(blob);
  });
}

// Keep dataUrlToBytes used — suppress unused warning
void (imageBytes: unknown) => imageBytes;
