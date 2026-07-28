import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getGeminiKey } from "@/lib/gemini";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/pemasaran")({ component: Pemasaran });

const PRODUCT_TYPES = [
  { k: "fnb", label: "Makanan & Minuman" },
  { k: "fashion", label: "Fashion & Pakaian" },
  { k: "otomotif", label: "Otomotif & Sparepart" },
  { k: "elektronik", label: "Elektronik & Gadget" },
  { k: "jasa", label: "Jasa & Layanan" },
  { k: "beauty", label: "Kecantikan & Kesehatan" },
  { k: "lainnya", label: "Bisnis Lainnya" },
];

const STYLES = [
  {
    k: "fresh",
    label: "Fresh Style",
    desc: "fresh clean minimal aesthetic, soft daylight, bright whites and mint accents",
  },
  {
    k: "bold",
    label: "Bold Style",
    desc: "bold high-contrast commercial style, saturated primary colors, thick sans-serif typography",
  },
  {
    k: "hot",
    label: "Hot Style",
    desc: "hot red and orange gradient, flame accents, appetizing steam, high energy",
  },
  {
    k: "traditional",
    label: "Traditional Style",
    desc: "traditional Indonesian heritage, batik ornament, warm brown and gold, rustic wood",
  },
  {
    k: "playful",
    label: "Playful Style",
    desc: "playful pop style, pastel confetti, bubbles, cheerful mood",
  },
  {
    k: "natural",
    label: "Natural Photography",
    desc: "natural photography style, editorial magazine look, soft studio lighting, shallow depth of field",
  },
  {
    k: "youth",
    label: "Youth Fun Poster",
    desc: "youth-oriented gen-z poster, bold color blocks, sticker collage, halftone dots",
  },
  {
    k: "street",
    label: "Street Fun Poster",
    desc: "urban street style, graffiti spray, neon signage, city night vibe",
  },
  {
    k: "rustic",
    label: "Rustic Style",
    desc: "rustic artisan style, kraft paper background, hand-lettered typography, warm earth tones",
  },
  {
    k: "emoji",
    label: "Emoji Style",
    desc: "cheerful emoji-based composition, chat-bubble callouts, bright yellow accents",
  },
  {
    k: "splash",
    label: "Splash Style",
    desc: "dynamic splash of liquid or paint, motion-frozen droplets, dramatic lighting",
  },
  {
    k: "ramadhan",
    label: "Ramadhan Style",
    desc: "ramadhan festive theme, lantern, crescent moon, deep green and gold, arabesque ornaments",
  },
  {
    k: "lebaran",
    label: "Lebaran Style",
    desc: "lebaran festive theme, ketupat, mosque silhouette, warm gold and emerald, celebration mood",
  },
  {
    k: "holiday",
    label: "Holiday Style",
    desc: "holiday celebration theme, festive garland, glowing lights, gift accents",
  },
];

const RATIOS = [
  { k: "1:1", label: "Square 1:1 (IG/Marketplace)" },
  { k: "4:5", label: "Portrait 4:5 (IG Feed)" },
  { k: "9:16", label: "Story/Reels 9:16" },
  { k: "16:9", label: "Landscape 16:9" },
];

function Pemasaran() {
  const [img, setImg] = useState<string | null>(null);
  const [productType, setProductType] = useState(PRODUCT_TYPES[0].k);
  const [styleKey, setStyleKey] = useState(STYLES[0].k);
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [cta, setCta] = useState("Pesan Sekarang!");
  const [extra, setExtra] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [ratio, setRatio] = useState(RATIOS[0].k);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const styleDef = STYLES.find((s) => s.k === styleKey)!;
  const productLabel = PRODUCT_TYPES.find((p) => p.k === productType)!.label;

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setImg(r.result as string);
    r.readAsDataURL(f);
  }

  async function generate() {
    if (!img) {
      toast.error("Unggah foto produk terlebih dahulu.");
      return;
    }
    setLoading(true);
    setResult(null);
    const steps = [
      "Mengidentifikasi produk...",
      `Menerapkan gaya ${styleDef.label}...`,
      "Menyusun komposisi & tipografi...",
      "Merender hasil final...",
    ];
    let i = 0;
    setStatus(steps[0]);
    const iv = setInterval(() => {
      i = (i + 1) % steps.length;
      setStatus(steps[i]);
    }, 2200);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sesi login berakhir. Silakan login ulang.");
      const res = await fetch("/api/generate-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageDataUrl: img,
          title,
          tagline,
          cta,
          contact: extra,
          price: "",
          styleLabel: styleDef.label,
          styleDescription: `${styleDef.desc}, hero composition with balanced negative space, ratio ${ratio}, product category: ${productLabel}. ${customPrompt || ""}`,
          userKey: getGeminiKey(),
        }),
      });
      const data = (await res.json()) as {
        imageDataUrl?: string;
        error?: string;
        provider?: string;
      };
      if (!res.ok || !data.imageDataUrl)
        throw new Error(data.error || "AI tidak mengembalikan gambar.");
      setResult(data.imageDataUrl);
      if (data.provider) {
        toast.success(`Poster berhasil dibuat menggunakan ${data.provider}!`);
      } else {
        toast.success("Poster berhasil dibuat dengan Gemini AI!");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      clearInterval(iv);
      setLoading(false);
      setStatus("");
    }
  }

  function downloadResult() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `bucici-poster-${Date.now()}.png`;
    a.click();
  }

  return (
    <div className="min-h-screen -m-4 sm:-m-6 p-4 sm:p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
        <Sparkles className="text-primary-glow" /> Studio POSM Hybrid AI
      </h1>
      <p className="text-xs sm:text-sm text-slate-400 mb-4">
        Universal untuk semua jenis bisnis · Powered by Gemini Image-to-Image.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <div className="space-y-3 min-w-0">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
            <label className="block cursor-pointer">
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20 text-sm">
                <Upload size={14} /> {img ? "Ganti Foto Produk" : "Upload Foto Produk"}
              </div>
              <input type="file" accept="image/*" onChange={upload} className="hidden" />
            </label>
            {img && <img src={img} alt="" className="rounded-lg h-24 w-full object-cover" />}
          </div>

          <F l="Jenis Produk">
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="i"
            >
              {PRODUCT_TYPES.map((p) => (
                <option key={p.k} value={p.k} className="text-black">
                  {p.label}
                </option>
              ))}
            </select>
          </F>

          <F l="Style Desain AI">
            <select value={styleKey} onChange={(e) => setStyleKey(e.target.value)} className="i">
              {STYLES.map((s) => (
                <option key={s.k} value={s.k} className="text-black">
                  {s.label}
                </option>
              ))}
            </select>
          </F>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
            <F l="Judul">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="i"
                placeholder="Nama produk"
              />
            </F>
            <F l="Tagline">
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="i"
                placeholder="Kalimat pemikat singkat"
              />
            </F>
            <F l="Call to Action">
              <input value={cta} onChange={(e) => setCta(e.target.value)} className="i" />
            </F>
            <F l="Info Tambahan (kontak/alamat/promo)">
              <input value={extra} onChange={(e) => setExtra(e.target.value)} className="i" />
            </F>
            <F l="Detail Prompt (Opsional)">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="i min-h-[60px]"
                placeholder="Contoh: tambahkan bendera merah putih di sudut kanan atas"
              />
            </F>
          </div>

          <F l="Rasio Gambar">
            <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="i">
              {RATIOS.map((r) => (
                <option key={r.k} value={r.k} className="text-black">
                  {r.label}
                </option>
              ))}
            </select>
          </F>

          <button
            onClick={generate}
            disabled={loading || !img}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {loading ? "Menggenerate poster..." : "Generate Poster Iklan"}
          </button>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 min-h-[420px] flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <Loader2 className="animate-spin text-fuchsia-400" size={64} />
                <Sparkles className="absolute inset-0 m-auto text-purple-300" size={24} />
              </div>
              <div className="text-sm font-semibold text-fuchsia-200">{status}</div>
              <div className="text-xs text-slate-400">
                AI sedang menyusun poster, mohon tunggu ~15-30 detik
              </div>
            </div>
          ) : result ? (
            <div className="relative group w-full">
              <img
                src={result}
                alt="Poster iklan"
                className="w-full rounded-lg object-contain max-h-[70vh]"
              />
              <button
                onClick={downloadResult}
                className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-3 py-2 text-xs flex items-center gap-1"
              >
                <Download size={14} /> Download
              </button>
            </div>
          ) : (
            <div className="text-center text-slate-400 text-sm">
              <Sparkles className="mx-auto mb-3 text-slate-500" size={40} />
              Hasil poster iklan akan tampil di sini.
            </div>
          )}
        </div>
      </div>

      <style>{`.i { width: 100%; background: rgba(255,255,255,0.1); border-radius: 6px; padding: 8px 10px; font-size: 13px; color: white; outline: none; border: 1px solid rgba(255,255,255,0.1); }`}</style>
    </div>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase text-slate-400 font-semibold mb-1">{l}</span>
      {children}
    </label>
  );
}
