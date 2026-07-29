// Hugging Face poster generation — via server proxy (/api/generate-poster).
// Menghindari CORS dengan routing request melalui TanStack Start API route.
// Model: black-forest-labs/FLUX.1-schnell (text-to-image, gratis).

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
 * Generate poster iklan melalui server proxy (menghindari CORS).
 * Foto produk dianalisis warnanya, lalu FLUX.1-schnell generate poster berkualitas tinggi.
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

  const response = await fetch("/api/generate-poster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, hfKey: key }),
  });

  // Model loading — retry sekali setelah delay
  if (response.status === 503) {
    await new Promise<void>((r) => setTimeout(r, 22000));
    return generatePosterImage(opts);
  }

  const data = (await response.json()) as { image?: string; error?: string; retry?: boolean };

  if (!response.ok || data.error) {
    throw new Error(data.error ?? "Terjadi kesalahan. Coba lagi.");
  }

  if (!data.image) throw new Error("Tidak ada gambar yang dikembalikan. Coba lagi.");

  return data.image;
}
