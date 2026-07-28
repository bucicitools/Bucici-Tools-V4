// Mock webhook receiver simulating Lynk.id license purchase + SMTP relay email.
import { createFileRoute } from "@tanstack/react-router";
import { db, uid } from "@/lib/store";

export const Route = createFileRoute("/api/public/lynk-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            email?: string;
            order_id?: string;
            qty?: number;
          };
          const qty = Math.max(1, Math.min(100, body.qty ?? 1));
          const codes: string[] = [];
          for (let i = 0; i < qty; i++) {
            const code = "BUCICI-" + Math.random().toString(36).slice(2, 8).toUpperCase();
            codes.push(code);
            db.set((n) => {
              n.licenses.push({
                id: uid("lic"),
                code,
                batch: `lynk-${body.order_id ?? "web"}`,
                used: false,
                createdAt: new Date().toISOString(),
              });
            });
          }
          // Simulate SMTP relay
          console.log(
            `[SMTP-MOCK] Email → ${body.email}: Terima kasih! Kode lisensi BUCICI Anda: ${codes.join(", ")}`,
          );
          return Response.json({ ok: true, codes, emailedTo: body.email ?? null });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
        }
      },
      GET: () =>
        Response.json({
          ok: true,
          message: "Lynk.id webhook endpoint. POST { email, order_id, qty } to create licenses.",
        }),
    },
  },
});
