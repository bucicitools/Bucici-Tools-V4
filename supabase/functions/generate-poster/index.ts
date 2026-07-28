// Supabase Edge Function: generate-poster
// Backup server-side endpoint (not required — app can call Gemini directly from browser via BYOK)
// Deploy: supabase functions deploy generate-poster
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const WHITELIST_EMAIL = "vernix.idn@gmail.com";
// Use the stable preview model — gemini-2.0-flash-exp-image-generation was deprecated/buggy
const IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "Token autentikasi diperlukan.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) return jsonError(401, "Sesi tidak valid.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, gemini_api_key")
      .eq("id", user.id)
      .maybeSingle();

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isSuperAdmin = roleRow?.role === "super_admin";
    const isWhitelisted = profile?.email?.toLowerCase() === WHITELIST_EMAIL;
    const useGlobalKey = isSuperAdmin || isWhitelisted;

    let apiKey: string | undefined;
    if (useGlobalKey) {
      apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey)
        return jsonError(500, "Global Gemini API Key belum dikonfigurasi oleh admin.");
    } else {
      apiKey = profile?.gemini_api_key || undefined;
      if (!apiKey)
        return jsonError(
          403,
          "API Key Gemini pribadi diperlukan. Buka Pengaturan → Kunci AI Pribadi.",
        );
    }

    const body = await req.json();
    const { imageDataUrl, title, tagline, cta, contact, styleLabel, styleDescription, productLabel, ratio, customPrompt } =
      body as {
        imageDataUrl: string;
        title?: string;
        tagline?: string;
        cta?: string;
        contact?: string;
        styleLabel?: string;
        styleDescription?: string;
        productLabel?: string;
        ratio?: string;
        customPrompt?: string;
      };

    if (!imageDataUrl) return jsonError(400, "imageDataUrl wajib diisi.");

    // Parse base64 from data URL
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return jsonError(400, "Format imageDataUrl tidak valid.");
    const [, mimeType, base64Data] = match;

    const prompt = [
      `Transform this product photo into a professional advertising poster for a ${productLabel ?? "business"}.`,
      styleDescription ? `Visual style: ${styleDescription}.` : "",
      ratio ? `Aspect ratio: ${ratio}.` : "",
      title ? `Main headline: "${title}".` : "",
      tagline ? `Tagline: "${tagline}".` : "",
      cta ? `Call-to-action: "${cta}".` : "",
      contact ? `Contact info: "${contact}".` : "",
      customPrompt ? `Extra: ${customPrompt}.` : "",
      "Keep the product as hero. Output a complete poster with text overlays.",
    ]
      .filter(Boolean)
      .join(" ");

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      const status = geminiRes.status;
      if (status === 400) return jsonError(400, "Format gambar atau prompt tidak valid.");
      if (status === 403) return jsonError(403, "API Key tidak valid.");
      if (status === 429) return jsonError(429, "Kuota API Key habis. Coba lagi nanti.");
      return jsonError(status, `Gemini error: ${errText.slice(0, 300)}`);
    }

    const data = await geminiRes.json();
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> =
      data?.candidates?.[0]?.content?.parts ?? [];

    const imagePart = parts.find((p) => p.inline_data?.data);
    const textPart = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join(" ");

    if (!imagePart?.inline_data) {
      return jsonError(500, textPart || "AI tidak mengembalikan gambar.");
    }

    const resultDataUrl = `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;

    return new Response(JSON.stringify({ imageDataUrl: resultDataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonError(500, (err as Error).message || "Kesalahan server.");
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
