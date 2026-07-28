import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Simple per-user rate limit for the shared fallback key (in-memory; per worker instance).
// Window: 1 hour. Max: 8 requests without BYOK.
const RATE = new Map<string, { count: number; ts: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_FREE = 8;

function checkRate(uid: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const cur = RATE.get(uid);
  if (!cur || now - cur.ts > WINDOW_MS) {
    RATE.set(uid, { count: 1, ts: now });
    return { ok: true, remaining: MAX_FREE - 1 };
  }
  if (cur.count >= MAX_FREE) return { ok: false, remaining: 0 };
  cur.count += 1;
  return { ok: true, remaining: MAX_FREE - cur.count };
}

export const Route = createFileRoute("/api/generate-poster")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ---- AUTH: require signed-in user ----
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : "";
          if (!token) {
            return Response.json(
              { error: "Anda harus login untuk memakai generator poster." },
              { status: 401 },
            );
          }
          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (h.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`)
                  h.delete("Authorization");
                h.set("apikey", SUPABASE_PUBLISHABLE_KEY);
                return fetch(input, { ...init, headers: h });
              },
            },
          });
          const { data: userData, error: userErr } = await authClient.auth.getUser(token);
          if (userErr || !userData?.user) {
            return Response.json(
              { error: "Sesi tidak valid. Silakan login ulang." },
              { status: 401 },
            );
          }
          const userId = userData.user.id;

          const {
            imageDataUrl,
            title,
            tagline,
            price,
            cta,
            contact,
            styleLabel,
            styleDescription,
            userKey: bodyUserKey,
          } = (await request.json()) as {
            imageDataUrl?: string;
            title?: string;
            tagline?: string;
            price?: string;
            cta?: string;
            contact?: string;
            styleLabel?: string;
            styleDescription?: string;
            userKey?: string;
          };

          // Check if caller is super_admin or vernix.idn@gmail.com
          const callerEmail = (userData.user.email ?? "").toLowerCase();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: roleRow } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "super_admin")
            .maybeSingle();

          const isSuperAdminOrVernix =
            callerEmail === "vernix.idn@gmail.com" ||
            callerEmail === "bucicitools@gmail.com" ||
            roleRow?.role === "super_admin";

          // ---- BYOK: read user's Gemini key from profile or request body ----
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("gemini_api_key")
            .eq("id", userId)
            .maybeSingle();

          const rawKey = ((bodyUserKey || profile?.gemini_api_key) ?? "").trim();
          const userKey = rawKey.length >= 20 ? rawKey : undefined;

          // Non-superadmin/non-vernix MUST provide their own Gemini API key
          if (!isSuperAdminOrVernix && !userKey) {
            return Response.json(
              {
                error:
                  "Gunakan API Key Gemini pribadi Anda. Silakan isi 'Kunci AI Pribadi' di Ruang Pengaturan atau masukkan di bilah atas Studio Pemasaran.",
              },
              { status: 400 },
            );
          }

          // Effective key to use
          const activeKey =
            userKey || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
          const lovableKey = process.env.LOVABLE_API_KEY;

          if (!activeKey && !lovableKey) {
            try {
              const freeImg = await generateWithPollinations(prompt);
              return Response.json({
                imageDataUrl: freeImg,
                provider: "Pollinations Free Infrastructure",
              });
            } catch (err) {
              return Response.json(
                {
                  error:
                    "Gagal memproses gambar dengan infrastruktur gratis. Silakan isi Kunci AI Pribadi Gemini di Ruang Pengaturan.",
                },
                { status: 500 },
              );
            }
          }

          // Rate limit only the shared fallback path
          if (!userKey) {
            const r = checkRate(userId);
            if (!r.ok) {
              return Response.json(
                {
                  error: `Kuota bersama harian tercapai (${MAX_FREE}/jam). Aktifkan Kunci AI Pribadi di Ruang Pengaturan untuk pemakaian tanpa batas.`,
                },
                { status: 429 },
              );
            }
          }

          const prompt = `Professional commercial advertisement poster for the product shown in the reference image. Preserve the exact product shape, proportions and identifiable details from the reference; only restyle the background, lighting and composition.
Style: ${styleLabel ?? "modern"} — ${styleDescription ?? "clean modern commercial style"}.
Overlay the following text onto the design in a bold, professional typography layout with clear hierarchy and high readability:
- Main Title (large, ALL CAPS): "${(title || "PRODUK UNGGULAN").toUpperCase()}"
${tagline ? `- Tagline (elegant subtitle): "${tagline}"` : ""}
${price ? `- Price badge (prominent): "${price}"` : ""}
${cta ? `- Call to action button/pill: "${cta}"` : ""}
${contact ? `- Contact line (small, bottom): "${contact}"` : ""}
The final image must look like a high-end, ready-to-publish social media ad banner: sharp focus, studio lighting, 8k resolution, photorealistic product placement, balanced composition.`;

          async function generateWithPollinations(pText: string): Promise<string> {
            const seed = Math.floor(Math.random() * 1000000);
            const cleanPrompt = pText.slice(0, 1000).replace(/[^a-zA-Z0-9\s,.-]/g, " ");
            const encoded = encodeURIComponent(cleanPrompt);
            const pollUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true&enhance=true`;
            const res = await fetch(pollUrl);
            if (!res.ok) {
              throw new Error(
                `Infrastruktur Gratis Pollinations (${res.status}) gagal memproses gambar.`,
              );
            }
            const buf = await res.arrayBuffer();
            const b64 = Buffer.from(buf).toString("base64");
            const ctype = res.headers.get("content-type") || "image/jpeg";
            return `data:${ctype};base64,${b64}`;
          }

          if (activeKey) {
            const parts: Array<Record<string, unknown>> = [{ text: prompt }];
            if (imageDataUrl) {
              const m = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
              if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
            }
            const upstream = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(activeKey)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts }],
                  generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
                }),
              },
            );
            const text = await upstream.text();
            if (!upstream.ok) {
              if (
                upstream.status === 429 ||
                text.includes("429") ||
                text.includes("Quota exceeded") ||
                text.includes("RESOURCE_EXHAUSTED") ||
                text.includes("limit: 0")
              ) {
                console.warn(
                  "Gemini 429 quota hit, using free Pollinations.ai image infrastructure fallback...",
                );
                try {
                  const freeImg = await generateWithPollinations(prompt);
                  return Response.json({
                    imageDataUrl: freeImg,
                    provider: "Pollinations Free Infrastructure",
                  });
                } catch (fallbackErr) {
                  return Response.json(
                    {
                      error: `Gemini Quota Exceeded (429) & Fallback gagal: ${(fallbackErr as Error).message}`,
                    },
                    { status: 429 },
                  );
                }
              }
              return Response.json(
                { error: `Gemini ${upstream.status}: ${text.slice(0, 400)}` },
                { status: upstream.status },
              );
            }
            const json = JSON.parse(text) as {
              candidates?: Array<{
                content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
              }>;
            };
            const partsOut = json.candidates?.[0]?.content?.parts ?? [];
            const imgPart = partsOut.find((p) => p.inlineData?.data);
            const b64 = imgPart?.inlineData?.data;
            if (!b64) {
              // Try fallback if no image returned
              try {
                const freeImg = await generateWithPollinations(prompt);
                return Response.json({
                  imageDataUrl: freeImg,
                  provider: "Pollinations Free Infrastructure",
                });
              } catch {
                return Response.json(
                  { error: "Gemini tidak mengembalikan gambar." },
                  { status: 502 },
                );
              }
            }
            const mime = imgPart?.inlineData?.mimeType ?? "image/png";
            return Response.json({ imageDataUrl: `data:${mime};base64,${b64}` });
          }

          // Fallback: Lovable AI Gateway
          const content: Array<
            { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
          > = [{ type: "text", text: prompt }];
          if (imageDataUrl) content.push({ type: "image_url", image_url: { url: imageDataUrl } });

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [{ role: "user", content }],
              modalities: ["image", "text"],
            }),
          });
          const text = await upstream.text();
          if (!upstream.ok) {
            try {
              const freeImg = await generateWithPollinations(prompt);
              return Response.json({
                imageDataUrl: freeImg,
                provider: "Pollinations Free Infrastructure",
              });
            } catch {
              return Response.json(
                { error: `Gateway ${upstream.status}: ${text.slice(0, 400)}` },
                { status: upstream.status },
              );
            }
          }
          const json = JSON.parse(text) as { data?: Array<{ b64_json?: string }> };
          const b64 = json.data?.[0]?.b64_json;
          if (!b64)
            return Response.json({ error: "Model tidak mengembalikan gambar." }, { status: 502 });
          return Response.json({ imageDataUrl: `data:image/png;base64,${b64}` });
        } catch (e) {
          return Response.json({ error: (e as Error).message ?? "Unknown error" }, { status: 500 });
        }
      },
    },
  },
});
