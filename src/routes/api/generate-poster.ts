import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy ke Hugging Face API.
// Berjalan di Node.js runtime (Vercel), timeout 60 detik.
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

          // Coba request ke HF, retry sekali jika model masih loading (503)
          const doRequest = async (): Promise<Response> => {
            const res = await fetch(
              "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${hfKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  inputs: prompt,
                  parameters: { num_inference_steps: 4 },
                }),
              },
            );
            if (res.status === 503) {
              // Model loading — tunggu 15 detik dan retry
              await new Promise<void>((r) => setTimeout(r, 15000));
              return doRequest();
            }
            return res;
          };

          const hfResponse = await doRequest();

          if (!hfResponse.ok) {
            const errText = await hfResponse.text();
            const status = hfResponse.status;
            let message: string;
            if (status === 401) message = "Token Hugging Face tidak valid. Cek kembali token Anda di huggingface.co/settings/tokens.";
            else if (status === 403) message = "Token tidak punya akses. Buat token baru bertipe Read di huggingface.co/settings/tokens.";
            else if (status === 429) message = "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
            else message = `Hugging Face error (${status}): ${errText.slice(0, 200)}`;
            return Response.json({ error: message }, { status });
          }

          // Convert binary image ke base64 (Node.js Buffer tersedia)
          const imageBuffer = await hfResponse.arrayBuffer();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const base64 = Buffer.from(imageBuffer).toString("base64");
          const contentType = hfResponse.headers.get("content-type") ?? "image/jpeg";

          return Response.json({ image: `data:${contentType};base64,${base64}` });
        } catch (err) {
          console.error("[generate-poster proxy error]", err);
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: `Kesalahan server: ${message}` }, { status: 500 });
        }
      },
    },
  },
});
