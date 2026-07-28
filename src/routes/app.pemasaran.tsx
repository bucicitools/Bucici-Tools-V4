import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Download, Loader2, Sparkles, ImageIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getGeminiKey, generatePosterImage } from "@/lib/gemini";

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

const LOADING_STEPS = [
  "Menganalisis foto produk...",
  "Mengidentifikasi komposisi...",
  "Menerapkan gaya desain...",
  "Menyusun tipografi & teks...",
  "Merender hasil final...",
];

function Pemasaran() {
  const [img, setImg] = useState<string | null>(null);
  const [imgName, setImgName] = useState("");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0].k);
  const [styleKey, setStyleKey] = useState(STYLES[0].k);
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [cta, setCta] = useState("Pesan Sekarang!");
  const [extra, setExtra] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [ratio, setRatio] = useState(RATIOS[0].k);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const hasKey = !!getGeminiKey();
  const styleDef = STYLES.find((s) => s.k === styleKey)!;
  const productLabel = PRODUCT_TYPES.find((p) => p.k === productType)!.label;

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgName(f.name);
    // Resize image to max 1024px before encoding to avoid payload too large
    const reader = new FileReader();
    reader.onload = () => {
      const orig = reader.result as string;
      const image = new Image();
      image.onload = () => {
        const MAX = 1024;
        let { width, height } = image;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
        setImg(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = orig;
    };
    reader.readAsDataURL(f);
  }

  async function generate() {
    if (!img) {
      toast.error("Upload foto produk terlebih dahulu.");
      return;
    }
    if (!hasKey) {
      toast.error("Masukkan Gemini API Key di Pengaturan → Kunci AI Pribadi.");
      return;
    }
    setLoading(true);
    setResult(null);
    setStepIdx(0);

    // Cycle through loading steps every 2.5s
    let idx = 0;
    const iv = setInterval(() => {
      idx = Math.min(idx + 1, LOADING_STEPS.length - 1);
      setStepIdx(idx);
    }, 2500);

    try {
      const dataUrl = await generatePosterImage({
        imageDataUrl: img,
        title,
        tagline,
        cta,
        contact: extra,
        styleLabel: styleDef.label,
        styleDescription: styleDef.desc,
        productLabel,
        ratio,
        customPrompt,
      });
      setResult(dataUrl);
      toast.success("Poster berhasil dibuat!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      clearInterval(iv);
      setLoading(false);
      setStepIdx(0);
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
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Sparkles className="text-purple-400" /> Studio Poster AI
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Generate poster iklan dari foto produk · Powered by Gemini Image Generation
        </p>
      </div>

      {/* Warning if no API key */}
      {!hasKey && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2 text-sm text-amber-300">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>
            Belum ada Gemini API Key.{" "}
            <a href="/app/pengaturan" className="underline font-semibold">
              Buka Pengaturan → Kunci AI Pribadi
            </a>{" "}
            untuk mengaktifkan generate poster.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Left: Controls */}
        <div className="space-y-3">
          {/* Upload foto */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Foto Produk</p>
            <label className="block cursor-pointer">
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20 text-sm transition">
                <Upload size={14} />
                {img ? `Ganti foto (${imgName || "uploaded"})` : "Upload Foto Produk"}
              </div>
              <input type="file" accept="image/*" onChange={upload} className="hidden" />
            </label>
            {img && (
              <img src={img} alt="Preview" className="rounded-lg h-28 w-full object-cover border border-white/10" />
            )}
          </div>

          {/* Jenis & Style */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Kategori & Gaya</p>
            <F l="Jenis Bisnis">
              <select value={productType} onChange={(e) => setProductType(e.target.value)} className="inp">
                {PRODUCT_TYPES.map((p) => (
                  <option key={p.k} value={p.k} className="text-black">{p.label}</option>
                ))}
              </select>
            </F>
            <F l="Style Desain">
              <select value={styleKey} onChange={(e) => setStyleKey(e.target.value)} className="inp">
                {STYLES.map((s) => (
                  <option key={s.k} value={s.k} className="text-black">{s.label}</option>
                ))}
              </select>
            </F>
            <F l="Rasio">
              <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="inp">
                {RATIOS.map((r) => (
                  <option key={r.k} value={r.k} className="text-black">{r.label}</option>
                ))}
              </select>
            </F>
          </div>

          {/* Teks poster */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Teks Poster</p>
            <F l="Judul / Nama Produk">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="inp" placeholder="Misal: Nasi Goreng Spesial" />
            </F>
            <F l="Tagline">
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="inp" placeholder="Kalimat pemikat singkat" />
            </F>
            <F l="Call to Action">
              <input value={cta} onChange={(e) => setCta(e.target.value)} className="inp" />
            </F>
            <F l="Kontak / Info Tambahan">
              <input value={extra} onChange={(e) => setExtra(e.target.value)} className="inp" placeholder="No. WA, alamat, promo, dll" />
            </F>
            <F l="Detail Prompt Tambahan (opsional)">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="inp min-h-[60px] resize-none"
                placeholder="Contoh: tambahkan bendera merah putih di sudut kanan"
              />
            </F>
          </div>

          <button
            onClick={generate}
            disabled={loading || !img || !hasKey}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {loading ? "Generating poster..." : "Generate Poster Iklan"}
          </button>
        </div>

        {/* Right: Result */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 min-h-[420px] flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-center px-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-purple-500/30 border-t-purple-400 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto text-purple-300" size={24} />
              </div>
              <div className="text-sm font-semibold text-fuchsia-200">{LOADING_STEPS[stepIdx]}</div>
              <div className="text-xs text-slate-400">Mohon tunggu sekitar 15–30 detik</div>
              <div className="flex gap-1">
                {LOADING_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 w-6 rounded-full transition-all ${
                      i <= stepIdx ? "bg-purple-400" : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : result ? (
            <div className="relative group w-full">
              <img
                src={result}
                alt="Poster iklan"
                className="w-full rounded-xl object-contain max-h-[75vh] border border-white/10"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  onClick={downloadResult}
                  className="rounded-lg bg-black/70 backdrop-blur px-3 py-2 text-xs flex items-center gap-1 hover:bg-black/90 transition"
                >
                  <Download size={14} /> Download PNG
                </button>
                <button
                  onClick={generate}
                  className="rounded-lg bg-purple-600/80 backdrop-blur px-3 py-2 text-xs flex items-center gap-1 hover:bg-purple-600 transition"
                >
                  <Sparkles size={14} /> Generate Ulang
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 space-y-3">
              <ImageIcon className="mx-auto text-slate-600" size={48} />
              <p className="text-sm">Hasil poster akan tampil di sini</p>
              <p className="text-xs text-slate-600">
                Upload foto produk, atur gaya & teks, lalu klik Generate
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`.inp { width: 100%; background: rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; font-size: 13px; color: white; outline: none; border: 1px solid rgba(255,255,255,0.12); } .inp::placeholder { color: rgba(255,255,255,0.3); } .inp:focus { border-color: rgba(168,85,247,0.6); background: rgba(255,255,255,0.12); }`}</style>
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
