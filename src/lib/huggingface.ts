// Poster generation menggunakan Pollinations.ai
// Gratis, tanpa API key, CORS supported, pakai model FLUX.
// https://pollinations.ai

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

// Tetap export agar pengaturan tidak error
export const HF_KEY_STORAGE = "bucici_hf_key";
export function getHFKey(): string | undefined { return undefined; }
export function setHFKey(_key: string) { /* no-op */ }

function getDominantColor(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 50; canvas.height = 50;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve("vibrant colors"); return; }
      ctx.drawImage(img, 0, 0, 50, 50);
      const d = ctx.getImageData(0, 0, 50, 50).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
      r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
      const mx = Math.max(r, g, b);
      let c = "vibrant mixed colors";
      if (mx === r && r > 150) c = "warm red and orange tones";
      else if (mx === g && g > 150) c = "fresh green tones";
      else if (mx === b && b > 150) c = "cool blue tones";
      else if (r > 200 && g > 200 && b > 200) c = "bright white and light tones";
      else if (r < 80 && g < 80 && b < 80) c = "deep dark dramatic tones";
      else if (r > 150 && g > 120 && b < 100) c = "warm golden-brown tones";
      resolve(c);
    };
    img.onerror = () => resolve("vibrant colors");
    img.src = dataUrl;
  });
}

function buildPrompt(opts: PosterOptions, dominantColor: string): string {
  // PENTING: Model FLUX tidak bisa membaca/menulis teks dengan akurat.
  // Fokus prompt pada deskripsi VISUAL produk berdasarkan warna & kategori,
  // bukan nama literal produk — agar tidak ada halusinasi teks di gambar.
  const productLabel = opts.productLabel; // kategori (mis. "Makanan & Minuman")
  const hasTitle = opts.title.trim().length > 0;

  // Deskripsi visual berdasarkan kategori produk
  const categoryVisuals: Record<string, string> = {
    fnb: "delicious food and beverage product beautifully plated and styled",
    fashion: "stylish clothing and fashion item displayed elegantly",
    otomotif: "automotive part or vehicle accessory displayed professionally",
    elektronik: "sleek electronic gadget or device showcased on clean surface",
    jasa: "professional service concept with clean modern iconography",
    beauty: "beauty and skincare product elegantly arranged",
    lainnya: "product item displayed attractively",
  };

  // Cari key kategori dari label
  const catKeyMap: Record<string, string> = {
    "Makanan & Minuman": "fnb",
    "Fashion & Pakaian": "fashion",
    "Otomotif & Sparepart": "otomotif",
    "Elektronik & Gadget": "elektronik",
    "Jasa & Layanan": "jasa",
    "Kecantikan & Kesehatan": "beauty",
    "Bisnis Lainnya": "lainnya",
  };
  const catKey = catKeyMap[productLabel] ?? "lainnya";
  const productVisual = categoryVisuals[catKey] ?? categoryVisuals.lainnya;

  const lines = [
    // Subjek utama: deskripsi visual produk dari foto yang diupload
    `A professional commercial advertising poster. The hero product is a ${productVisual}.`,
    `The product appearance is derived from the uploaded reference photo — replicate its exact shape, color, texture, and form faithfully.`,
    `Do NOT invent or hallucinate any product name text in the image.`,
    // Gaya desain
    `Design style: ${opts.styleDescription}.`,
    // Warna dominan
    `Color palette inspired by: ${dominantColor}.`,
    // Teks overlay — hanya jika user mengisi
    hasTitle ? `The poster headline text reads exactly: "${opts.title.trim()}". Render this text clearly and accurately.` : "",
    opts.tagline ? `Tagline below headline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action button text: "${opts.cta}".` : "",
    opts.contact ? `Small contact info at the bottom: "${opts.contact}".` : "",
    opts.customPrompt ? `Additional instruction: ${opts.customPrompt}.` : "",
    "Ultra high quality, sharp professional layout, premium commercial look, social media ready.",
  ];

  return lines.filter(Boolean).join(" ");
}

function getRatio(ratio: string): { w: number; h: number } {
  const map: Record<string, { w: number; h: number }> = {
    "1:1": { w: 1024, h: 1024 },
    "4:5": { w: 896, h: 1120 },
    "9:16": { w: 576, h: 1024 },
    "16:9": { w: 1024, h: 576 },
  };
  return map[ratio] ?? { w: 1024, h: 1024 };
}

export async function generatePosterImage(opts: PosterOptions): Promise<string> {
  const dominantColor = opts.imageDataUrl
    ? await getDominantColor(opts.imageDataUrl)
    : "vibrant colors";

  const prompt = buildPrompt(opts, dominantColor);
  const { w, h } = getRatio(opts.ratio);
  const seed = Math.floor(Math.random() * 999999);

  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true&model=flux`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Pollinations error (${response.status}). Coba lagi.`);
  }

  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca gambar."));
    reader.readAsDataURL(blob);
  });
}
