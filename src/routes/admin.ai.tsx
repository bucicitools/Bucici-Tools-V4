import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { askGemini } from "@/lib/gemini";
import { db } from "@/lib/store";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/admin/ai")({
  component: AISuperAdmin,
});

function AISuperAdmin() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string>("");

  const stats = (() => {
    const d = db.get();
    return {
      tenants: d.tenants.length,
      activeTenants: d.tenants.filter((t) => t.active).length,
      licenses: d.licenses.length,
      usedLicenses: d.licenses.filter((l) => l.used).length,
      users: d.users.length,
      transactions: d.transactions.length,
    };
  })();

  const chartData = [
    { name: "Tenants", value: stats.tenants },
    { name: "Aktif", value: stats.activeTenants },
    { name: "Lisensi", value: stats.licenses },
    { name: "Terpakai", value: stats.usedLicenses },
    { name: "Pengguna", value: stats.users },
    { name: "Transaksi", value: stats.transactions },
  ];

  async function ask() {
    if (!prompt.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const sys = `Anda adalah AI-sisten Super-Admin BUCICI, membantu menganalisis data platform multi-tenant.
Data agregat saat ini: ${JSON.stringify(stats)}.
Jawab dalam Bahasa Indonesia, gunakan Markdown termasuk tabel bila relevan.`;
      const res = await askGemini(prompt, sys);
      setAnswer(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="text-primary-glow" /> AI-sisten Super Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Konsol AI global — analisis, visualisasi & pengolahan data platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Object.entries(stats).map(([k, v]) => (
          <div key={k} className="neu p-4">
            <div className="text-xs text-muted-foreground uppercase">{k}</div>
            <div className="mt-1 text-2xl font-bold text-primary">{v}</div>
          </div>
        ))}
      </div>

      <div className="neu p-4">
        <h2 className="mb-2 text-sm font-semibold">Grafik Ringkas</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="oklch(0.55 0.18 250)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="neu p-5">
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Tanyakan apa saja tentang data platform..."
            className="flex-1 rounded-xl neu-inset px-4 py-3 outline-none"
          />
          <button
            onClick={ask}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Tanya
          </button>
        </div>
        {answer && (
          <div className="mt-4 rounded-xl bg-secondary/50 p-4 text-sm whitespace-pre-wrap font-[Inter,ui-sans-serif]">
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}
