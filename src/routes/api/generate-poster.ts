import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy ke Hugging Face API.
// Menghindari CORS karena request dilakukan dari server, bukan browser.
export const Route = createFileRoute("/api/generate-poster")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { prompt: string; hfKey: string };
          const { prompt, hfKey } = body;

          if (!prompt || !hfKey) {
            return Response.json({ error: "prompt dan hfKey wajib diisi" }, { status: 400 });
          }

          if (!hfKey.startsWith("hf_")) {
            return Response.json(
              { error: "Token Hugging Face tidak valid. Format harus hf_..." },
              { status: 401 },
            );
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
            return Response.json(
              { error: "Model sedang dimuat, coba lagi dalam 20 detik.", retry: true },
              { status: 503 },
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
            return Response.json({ error: message }, { status });
          }

          // Kembalikan gambar sebagai base64 JSON
          const imageBuffer = await hfResponse.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString("base64");
          const contentType = hfResponse.headers.get("content-type") ?? "image/jpeg";

          return Response.json({ image: `data:${contentType};base64,${base64}` });
        } catch (err) {
          console.error("[generate-poster proxy error]", err);
          return Response.json({ error: "Terjadi kesalahan server. Coba lagi." }, { status: 500 });
        }
      },
    },
  },
});
