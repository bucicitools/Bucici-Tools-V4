import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askGemini } from "@/lib/gemini";
import { currentTenant, db, formatIDR } from "@/lib/store";

export const Route = createFileRoute("/app/kasir/ai")({ component: AITenant });

interface Msg {
  role: "user" | "assistant";
  text: string;
}

function AITenant() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Halo! Saya AI-sisten Bucici. Tanyakan analisis penjualan, produk terlaris, tren, atau ide bisnis.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const t = currentTenant();

  async function send() {
    if (!input.trim() || !t) return;
    const q = input.trim();
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const d = db.get();
      const txs = d.transactions.filter((x) => x.tenantId === t.id).slice(0, 100);
      const products = d.products.filter((p) => p.tenantId === t.id);
      const summary = {
        tenant: t.businessName,
        totalTransaksi: txs.length,
        omzetTotal: txs.filter((x) => x.status === "paid").reduce((a, b) => a + b.total, 0),
        produk: products.map((p) => ({ nama: p.name, harga: formatIDR(p.price), stok: p.stock })),
        transaksiTerakhir: txs.slice(0, 20).map((x) => ({
          tanggal: x.createdAt.slice(0, 10),
          total: x.total,
          status: x.status,
          items: x.items.map((i) => `${i.name} x${i.qty}`),
        })),
      };
      const sys = `Anda adalah AI-sisten Bucici, asisten bisnis untuk tenant "${t.businessName}".
Data ringkas tenant: ${JSON.stringify(summary)}.
Jawab dalam Bahasa Indonesia dengan gaya ramah. Gunakan Markdown termasuk tabel bila membandingkan data.`;
      const res = await askGemini(q, sys);
      setMsgs((m) => [...m, { role: "assistant", text: res }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="neu flex flex-col h-[calc(100vh-14rem)]">
      <div className="p-4 border-b border-border/50 flex items-center gap-2">
        <Sparkles className="text-primary-glow" size={18} />
        <h2 className="font-bold">AI-sisten Bucici</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-gradient-primary text-primary-foreground" : "bg-secondary"}`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="animate-spin" size={14} /> Berpikir...
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border/50 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Tanya apa saja..."
          className="flex-1 rounded-xl neu-inset px-4 py-2 text-sm outline-none"
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded-xl bg-gradient-primary px-4 text-primary-foreground disabled:opacity-60"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
