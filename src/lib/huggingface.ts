// Hugging Face Inference API — text-to-image BYOK.
// Model: black-forest-labs/FLUX.1-schnell (gratis, kualitas tinggi).
// User upload foto produk → kita analisis warna & konten → buat prompt kaya → generate poster.

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
function getDominantColors(dataUrl: string): Promise<string> {
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
      // Describe color in words
      const max = Math.max(r, g, b);
      let colorDesc = "vibrant";
      if (max === r && r > 150) colorDesc = "warm red-orange tones";
      else if (max === g && g > 150) colorDesc = "fresh green tones";
      else if (max === b && b > 150) colorDesc = "cool blue tones";
      else if (r > 200 && g > 200 && b > 200) colorDesc = "bright white and light tones";
      else if (r < 80 && g < 80 && b < 80) colorDesc = "deep dark tones";
      else if (r > 150 && g > 120 && b < 100) colorDesc = "warm golden-brown tones";
      else colorDesc = "rich mixed color tones";
      resolve(colorDesc);
    };
    img.onerror = () => resolve("vibrant colors");
    img.src = dataUrl;
  });
}

function buildPosterPrompt(opts: PosterOptions, dominantColor: string): string {
  const parts = [
    `A professional commercial advertising poster for a ${opts.productLabel} business.`,
    `Style: ${opts.styleDescription}.`,
    `The product has ${dominantColor}.`,
    `The poster prominently features the product as the hero element, beautifully lit and styled.`,
    opts.title
      ? `Large bold headline text on the poster reads: "${opts.title}".`
      : "",
    opts.tagline
      ? `Supporting tagline text: "${opts.tagline}".`
      : "",
    opts.cta
      ? `A prominent call-to-action element says: "${opts.cta}".`
      : "",
    opts.contact
      ? `Contact or promo info at the bottom: "${opts.contact}".`
      : "",
    opts.customPrompt ? `Additional details: ${opts.customPrompt}.` : "",
    "Ultra high quality, sharp typography, premium commercial look, social media ready, professional graphic design, 4K.",
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Generate poster iklan menggunakan HF FLUX.1-schnell (text-to-image).
 * Foto produk dianalisis untuk memperkaya prompt — gratis dengan token HF standar.
 */
export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const key = getHFKey();
  if (!key) {
    throw new Error(
      "Token Hugging Face belum diatur. Buka Pengaturan \u2192 Kunci AI Pribadi dan masukkan token dari huggingface.co/settings/tokens.",
    );
  }

  // Analisis warna dominan dari foto produk yang diupload
  const dominantColor = opts.imageDataUrl
    ? await getDominantColors(opts.imageDataUrl)
    : "vibrant colors";

  const prompt = buildPosterPrompt(opts, dominantColor);

  const response = await fetch(
    "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "x-wait-for-model": "true",
      },
      body: JSON.stringify({ inputs: prompt }),
    },
  );

  // Model masih loading — tunggu dan retry
  if (response.status === 503) {
    await new Promise<void>((r) => setTimeout(r, 20000));
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
        "Token tidak punya akses. Buat token baru bertipe \u2018Read\u2019 di huggingface.co/settings/tokens.",
      );
    if (status === 429)
      throw new Error("Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.");
    throw new Error(`Hugging Face error (${status}): ${errText.slice(0, 300)}`);
  }

  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca hasil gambar dari Hugging Face."));
    reader.readAsDataURL(blob);
  });
}
