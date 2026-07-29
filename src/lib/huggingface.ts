// Hugging Face Inference API — direct browser call, text-to-image.
// Model: black-forest-labs/FLUX.1-schnell (gratis, HF mendukung CORS untuk model ini).
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

/** Analisis warna dominan dari gambar menggunakan canvas sampling */
function getDominantColor(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve("vibrant colors"); return; }
      ctx.drawImage(img, 0, 0, 50, 50);
      const data = ctx.getImageData(0, 0, 50, 50).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 16) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
      }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      const max = Math.max(r, g, b);
      let colorDesc = "vibrant mixed colors";
      if (max === r && r > 150) colorDesc = "warm red and orange tones";
      else if (max === g && g > 150) colorDesc = "fresh green tones";
      else if (max === b && b > 150) colorDesc = "cool blue tones";
      else if (r > 200 && g > 200 && b > 200) colorDesc = "bright white and light tones";
      else if (r < 80 && g < 80 && b < 80) colorDesc = "deep dark dramatic tones";
      else if (r > 150 && g > 120 && b < 100) colorDesc = "warm golden-brown tones";
      resolve(colorDesc);
    };
    img.onerror = () => resolve("vibrant colors");
    img.src = dataUrl;
  });
}

function buildPrompt(opts: PosterOptions, dominantColor: string): string {
  return [
    `A professional commercial advertising poster for a ${opts.productLabel} business.`,
    `Visual style: ${opts.styleDescription}.`,
    `The featured product has ${dominantColor}.`,
    `The product is the hero element, beautifully lit, centered, and styled for commercial use.`,
    opts.title ? `Large bold headline text reads: "${opts.title}".` : "",
    opts.tagline ? `Supporting tagline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action element: "${opts.cta}".` : "",
    opts.contact ? `Contact info at the bottom: "${opts.contact}".` : "",
    opts.customPrompt ? `Additional details: ${opts.customPrompt}.` : "",
    "Ultra high quality, sharp professional typography, premium commercial graphic design, social media ready, 4K resolution.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Generate poster iklan langsung dari browser ke HF API.
 * HF mendukung CORS untuk FLUX.1-schnell dengan request JSON sederhana.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getHFKey();
  if (!key) {
    throw new Error(
      "Token Hugging Face belum diatur. Buka Pengaturan \u2192 Kunci AI Pribadi.",
    );
  }

  const dominantColor = opts.imageDataUrl
    ? await getDominantColor(opts.imageDataUrl)
    : "vibrant colors";

  const prompt = buildPrompt(opts, dominantColor);

  const doRequest = async (retried = false): Promise<string> => {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { num_inference_steps: 4 },
        }),
      },
    );

    // Model masih loading — tunggu dan retry sekali
    if (response.status === 503 && !retried) {
      await new Promise<void>((r) => setTimeout(r, 20000));
      return doRequest(true);
    }

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status;
      if (status === 401)
        throw new Error("Token Hugging Face tidak valid. Cek kembali token di huggingface.co/settings/tokens.");
      if (status === 403)
        throw new Error("Token tidak punya akses. Buat token baru bertipe Read di huggingface.co/settings/tokens.");
      if (status === 429)
        throw new Error("Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.");
      if (status === 503)
        throw new Error("Model sedang sangat sibuk. Tunggu 30 detik lalu coba lagi.");
      throw new Error(`Hugging Face error (${status}): ${errText.slice(0, 200)}`);
    }

    // Response adalah binary image
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Gagal membaca hasil gambar."));
      reader.readAsDataURL(blob);
    });
  };

  return doRequest();
}
