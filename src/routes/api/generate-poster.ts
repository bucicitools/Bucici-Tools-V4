// Server-side proxy ke Hugging Face API.
// Menghindari CORS karena request dilakukan dari server, bukan browser.
import { createAPIFileRoute } from "@tanstack/react-start/api";

export const APIRoute = createAPIFileRoute("/api/generate-poster")({
  async POST({ request }) {
    try {
      const body = (await request.json()) as { prompt: string; hfKey: string };
      const { prompt, hfKey } = body;

      if (!prompt || !hfKey) {
        return new Response(JSON.stringify({ error: "prompt dan hfKey wajib diisi" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!hfKey.startsWith("hf_")) {
        return new Response(JSON.stringify({ error: "Token Hugging Face tidak valid. Format harus hf_..." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const hfResponse = await fetch(
        "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfKey}`,
            "Content-Type": "application/json",
            "x-wait-for-model": "true",
          },
          body: JSON.stringify({ inputs: prompt }),
        },
      );

      if (hfResponse.status === 503) {
        return new Response(
          JSON.stringify({ error: "Model sedang dimuat, coba lagi dalam 20 detik.", retry: true }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }

      if (!hfResponse.ok) {
        const errText = await hfResponse.text();
        const status = hfResponse.status;
        let message = `Hugging Face error (${status})`;
        if (status === 401) message = "Token Hugging Face tidak valid. Cek kembali token Anda.";
        else if (status === 403) message = "Token tidak punya akses. Buat token baru bertipe Read.";
        else if (status === 429) message = "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
        else message = `Hugging Face error (${status}): ${errText.slice(0, 200)}`;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Kembalikan gambar sebagai base64 JSON
      const imageBuffer = await hfResponse.arrayBuffer();
      const base64 = Buffer.from(imageBuffer).toString("base64");
      const contentType = hfResponse.headers.get("content-type") ?? "image/jpeg";

      return new Response(
        JSON.stringify({ image: `data:${contentType};base64,${base64}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("[generate-poster proxy error]", err);
      return new Response(
        JSON.stringify({ error: "Terjadi kesalahan server. Coba lagi." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
});
