/**
 * Alternative image generation engines (Replicate & HuggingFace).
 * Keys are stored in localStorage for simplicity (no store.ts changes needed).
 *
 * Engine priority per user preference:
 *   "gemini"       → src/lib/gemini.ts (existing)
 *   "replicate"    → FLUX.1 Kontext (image editing model)
 *   "huggingface"  → instruct-pix2pix (image-to-image editing)
 */

export type ImageGenEngine = "gemini" | "replicate" | "huggingface";

const REPLICATE_KEY = "bucici_replicate_key";
const HF_KEY = "bucici_hf_key";
const ENGINE_KEY = "bucici_image_engine";

export function getReplicateKey(): string | undefined {
  return localStorage.getItem(REPLICATE_KEY) || undefined;
}

export function getHuggingFaceKey(): string | undefined {
  return localStorage.getItem(HF_KEY) || undefined;
}

export function saveReplicateKey(key: string): void {
  if (key.trim()) localStorage.setItem(REPLICATE_KEY, key.trim());
  else localStorage.removeItem(REPLICATE_KEY);
}

export function saveHuggingFaceKey(key: string): void {
  if (key.trim()) localStorage.setItem(HF_KEY, key.trim());
  else localStorage.removeItem(HF_KEY);
}

export function getSelectedEngine(): ImageGenEngine {
  const v = localStorage.getItem(ENGINE_KEY) as ImageGenEngine | null;
  return v ?? "gemini";
}

export function setSelectedEngine(engine: ImageGenEngine): void {
  localStorage.setItem(ENGINE_KEY, engine);
}

export interface AltPosterOptions {
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

function buildPrompt(opts: AltPosterOptions): string {
  return [
    `Transform this product photo into a professional advertising poster for a ${opts.productLabel} business.`,
    `Visual style: ${opts.styleDescription}.`,
    `Aspect ratio: ${opts.ratio}.`,
    opts.title ? `Headline text: "${opts.title}".` : "",
    opts.tagline ? `Tagline: "${opts.tagline}".` : "",
    opts.cta ? `Call-to-action: "${opts.cta}".` : "",
    opts.contact ? `Footer info: "${opts.contact}".` : "",
    opts.customPrompt ? `Extra instructions: ${opts.customPrompt}.` : "",
    "Make it a premium, ready-for-social-media advertising poster. Include all text overlays.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Replicate ────────────────────────────────────────────────────────────────

/**
 * Generate poster using Replicate's FLUX.1 Kontext Dev model.
 * This model is specifically designed for image editing (image-to-image).
 * Uses `Prefer: wait` for synchronous response (up to 60s).
 * Falls back to polling if still processing after initial request.
 */
export async function generateWithReplicate(
  key: string,
  opts: AltPosterOptions,
): Promise<string> {
  if (!key) throw new Error("Replicate API token belum diisi.");

  const prompt = buildPrompt(opts);

  // Create prediction with Prefer: wait for synchronous response
  const createRes = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          input_image: opts.imageDataUrl,
          prompt,
          aspect_ratio: normalizeRatioForReplicate(opts.ratio),
          output_format: "webp",
          output_quality: 90,
        },
      }),
    },
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    if (createRes.status === 401)
      throw new Error(
        "Replicate token tidak valid. Dapatkan token di replicate.com/account/api-tokens.",
      );
    if (createRes.status === 402)
      throw new Error(
        "Akun Replicate tidak memiliki kredit. Isi kredit di replicate.com/account/billing (mulai $5, sekitar Rp80rb).",
      );
    if (createRes.status === 422)
      throw new Error("Format gambar tidak didukung. Coba gambar JPG/PNG yang lebih kecil.");
    throw new Error(`Replicate error (${createRes.status}): ${errText.slice(0, 200)}`);
  }

  const prediction = await createRes.json() as {
    id: string;
    status: string;
    output?: string | string[];
    error?: string;
  };

  // Already completed (Prefer: wait worked)
  if (prediction.status === "succeeded") {
    return extractReplicateOutput(prediction.output);
  }

  // Still processing — poll
  if (prediction.status === "processing" || prediction.status === "starting") {
    return await pollReplicate(key, prediction.id);
  }

  throw new Error(prediction.error ?? "Replicate tidak berhasil generate gambar. Coba lagi.");
}

async function pollReplicate(key: string, predictionId: string): Promise<string> {
  const maxAttempts = 30; // 60 seconds total
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const pred = await res.json() as {
      status: string;
      output?: string | string[];
      error?: string;
    };
    if (pred.status === "succeeded") return extractReplicateOutput(pred.output);
    if (pred.status === "failed" || pred.status === "canceled") {
      throw new Error(`Generate gagal: ${pred.error ?? "Unknown error"}`);
    }
  }
  throw new Error("Generate timeout (60s). Coba lagi beberapa saat kemudian.");
}

function extractReplicateOutput(output: string | string[] | undefined): string {
  if (!output) throw new Error("Replicate tidak mengembalikan gambar.");
  const url = Array.isArray(output) ? output[0] : output;
  if (!url) throw new Error("Replicate tidak mengembalikan URL gambar.");
  return url;
}

function normalizeRatioForReplicate(ratio: string): string {
  const map: Record<string, string> = {
    "1:1": "1:1",
    "4:5": "4:5",
    "9:16": "9:16",
    "16:9": "16:9",
  };
  return map[ratio] ?? "1:1";
}

// ─── HuggingFace ──────────────────────────────────────────────────────────────

/**
 * Generate poster using HuggingFace Inference API.
 * Uses instruct-pix2pix: image editing via natural language instruction.
 * Free tier available at huggingface.co (requires account + access token).
 */
export async function generateWithHuggingFace(
  key: string,
  opts: AltPosterOptions,
): Promise<string> {
  if (!key) throw new Error("HuggingFace token belum diisi.");

  const match = opts.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format gambar tidak valid.");
  const [, , base64Data] = match;

  const prompt = buildPrompt(opts);

  const res = await fetch(
    "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: base64Data,
        parameters: {
          prompt,
          image_guidance_scale: 1.2,
          guidance_scale: 7.5,
          num_inference_steps: 20,
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403)
      throw new Error(
        "HuggingFace token tidak valid. Dapatkan token gratis di huggingface.co/settings/tokens.",
      );
    if (res.status === 503) {
      // Model loading — retry after 20s
      const parsed = JSON.parse(errText.trim().startsWith("{") ? errText : "{}") as { estimated_time?: number };
      const waitSec = Math.ceil(parsed.estimated_time ?? 20);
      throw new Error(
        `Model HuggingFace sedang loading (~${waitSec}s). Coba lagi dalam ${waitSec} detik.`,
      );
    }
    if (res.status === 429)
      throw new Error("Kuota HuggingFace habis. Coba beberapa menit lagi.");
    throw new Error(`HuggingFace error (${res.status}): ${errText.slice(0, 200)}`);
  }

  const blob = await res.blob();
  if (!blob.size) throw new Error("HuggingFace tidak mengembalikan gambar. Coba lagi.");

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
