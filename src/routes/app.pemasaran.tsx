import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles, AlertCircle, Copy, Check, Wand2, FileText } from "lucide-react";
import { toast } from "sonner";
import { getGeminiKey, askGemini } from "@/lib/gemini";

export const Route = createFileRoute("/app/pemasaran")({ component: RuangKreatif });

// ─── Konstanta ───────────────────────────────────────────────────────────────

const PRODUCT_TYPES = [
  { k: "fnb",        label: "Makanan & Minuman" },
  { k: "fashion",    label: "Fashion & Pakaian" },
  { k: "otomotif",   label: "Otomotif & Sparepart" },
  { k: "elektronik", label: "Elektronik & Gadget" },
  { k: "jasa",       label: "Jasa & Layanan" },
  { k: "beauty",     label: "Kecantikan & Kesehatan" },
  { k: "lainnya",    label: "Bisnis Lainnya" },
];

const STYLES = [
  { k: "fresh",       label: "Fresh Style",        desc: "fresh clean minimal aesthetic, soft daylight, bright whites and mint accents" },
  { k: "bold",        label: "Bold Style",          desc: "bold high-contrast commercial style, saturated primary colors, thick sans-serif typography" },
  { k: "hot",         label: "Hot Style",           desc: "hot red and orange gradient, flame accents, appetizing steam, high energy" },
  { k: "traditional", label: "Traditional Style",   desc: "traditional Indonesian heritage, batik ornament, warm brown and gold, rustic wood" },
  { k: "playful",     label: "Playful Style",       desc: "playful pop style, pastel confetti, bubbles, cheerful mood" },
  { k: "natural",     label: "Natural Photography", desc: "natural photography editorial, soft studio lighting, shallow depth of field" },
  { k: "youth",       label: "Youth Fun Poster",    desc: "youth gen-z poster, bold color blocks, sticker collage, halftone dots" },
  { k: "street",      label: "Street Fun Poster",   desc: "urban street style, graffiti spray, neon signage, city night vibe" },
  { k: "rustic",      label: "Rustic Style",        desc: "rustic artisan, kraft paper background, hand-lettered typography, warm earth tones" },
  { k: "emoji",       label: "Emoji Style",         desc: "cheerful emoji-based composition, chat-bubble callouts, bright yellow accents" },
  { k: "splash",      label: "Splash Style",        desc: "dynamic splash of liquid or paint, motion-frozen droplets, dramatic lighting" },
  { k: "ramadhan",    label: "Ramadhan Style",      desc: "ramadhan festive theme, lantern, crescent moon, deep green and gold, arabesque ornaments" },
  { k: "lebaran",     label: "Lebaran Style",       desc: "lebaran festive, ketupat, mosque silhouette, warm gold and emerald" },
  { k: "holiday",     label: "Holiday Style",       desc: "holiday celebration, festive garland, glowing lights, gift accents" },
];

const RATIOS = [
  { k: "1:1",  label: "Square 1:1 (1080×1080px)",      px: "1080x1080 pixels" },
  { k: "4:5",  label: "Portrait 4:5 (1080×1350px)",    px: "1080x1350 pixels" },
  { k: "9:16", label: "Story/Reels 9:16 (1080×1920px)", px: "1080x1920 pixels" },
  { k: "16:9", label: "Landscape 16:9 (1200×675px)",    px: "1200x675 pixels" },
];

// ─── Komponen utama ──────────────────────────────────────────────────────────

function RuangKreatif() {
  const [productType, setProductType] = useState(PRODUCT_TYPES[0].k);
  const [styleKey, setStyleKey]       = useState(STYLES[0].k);
  const [ratio, setRatio]             = useState(RATIOS[0].k);
  const [title, setTitle]             = useState("");
  const [tagline, setTagline]         = useState("");
  const [price, setPrice]             = useState("");
  const [cta, setCta]                 = useState("Pesan Sekarang!");
  const [contact, setContact]         = useState("");

  const [loading, setLoading]         = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [caption, setCaption]         = useState("");
  const [copiedImg, setCopiedImg]     = useState(false);
  const [copiedCap, setCopiedCap]     = useState(false);

  const hasKey       = !!getGeminiKey();
  const styleDef     = STYLES.find((s) => s.k === styleKey)!;
  const ratioDef     = RATIOS.find((r) => r.k === ratio)!;
  const productLabel = PRODUCT_TYPES.find((p) => p.k === productType)!.label;
  const canGenerate  = hasKey && !!title.trim() && !loading;

  async function generate() {
    if (!title.trim()) { toast.error("Isi Judul/Nama Produk terlebih dahulu."); return; }
    if (!hasKey) { toast.error("Masukkan Gemini API Key di Pengaturan → Kunci AI Pribadi."); return; }

    setLoading(true);
    setImagePrompt("");
    setCaption("");

    const systemPrompt = `You are a professional advertising creative director and copywriter specializing in Indonesian SME (UMKM) marketing. Generate exactly two outputs in the specified format. Be precise, creative, and commercially effective.`;

    const userPrompt = `Generate marketing content for an Indonesian UMKM business with these details:
- Business type: ${productLabel}
- Product/Service name: ${title}
- Tagline/Advantages: ${tagline || "(none)"}
- Price: ${price || "(not specified)"}
- Call to Action: ${cta}
- Contact/Info: ${contact || "(none)"}
- Visual Style: ${styleDef.label} — ${styleDef.desc}
- Poster Dimensions: ${ratioDef.px} (${ratio} ratio)

Generate EXACTLY this format with these two sections:

===IMAGE_PROMPT===
Write a detailed image-generation prompt in English (for use with Gemini, ChatGPT, or Midjourney image tools). The prompt must:
1. Start with "Transform the uploaded product photo into a professional advertising poster"
2. Specify the exact visual style: ${styleDef.desc}
3. Include text overlay instructions with the headline "${title}"${tagline ? `, tagline "${tagline}"` : ""}${price ? `, price "${price}"` : ""}, and CTA "${cta}"
4. Specify canvas size: ${ratioDef.px}
5. End with quality instructions: "premium commercial quality, sharp text, vibrant colors, ready for social media"
Keep it under 200 words.

===CAPTION===
Write an Instagram/WhatsApp caption in Bahasa Indonesia that:
1. Opens with an attention-grabbing hook (no generic "Hai!")
2. Highlights key product benefits (2-3 points with emoji)
3. Includes the price if provided
4. Ends with the CTA and contact info
5. Uses relevant hashtags (5-7 tags)
Keep it under 150 words, conversational, and relatable for Indonesian audience.`;

    try {
      const raw = await askGemini(userPrompt, systemPrompt);

      const imgMatch = raw.match(/===IMAGE_PROMPT===\s*([\s\S]*?)(?:===CAPTION===|$)/);
      const capMatch = raw.match(/===CAPTION===\s*([\s\S]*?)$/);

      setImagePrompt(imgMatch?.[1]?.trim() ?? raw);
      setCaption(capMatch?.[1]?.trim() ?? "");
      toast.success("Prompt & caption berhasil dibuat!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copyText(text: string, type: "img" | "cap") {
    navigator.clipboard.writeText(text).then(() => {
      if (type === "img") { setCopiedImg(true); setTimeout(() => setCopiedImg(false), 2000); }
      else { setCopiedCap(true); setTimeout(() => setCopiedCap(false), 2000); }
      toast.success("Disalin ke clipboard!");
    });
  }

  return (
    <div className="min-h-screen -m-4 sm:-m-6 p-4 sm:p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Wand2 className="text-purple-400" /> Ruang Kreatif
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Buat Prompt Iklan Profesional untuk Gemini, ChatGPT & Midjourney — plus caption siap upload
        </p>
      </div>

      {/* Banner belum ada key */}
      {!hasKey && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4">
          <AlertCircle className="text-amber-400 mt-0.5 shrink-0" size={18} />
          <div className="text-sm">
            <p className="font-semibold text-amber-300">Gemini API Key belum diatur</p>
            <p className="text-amber-200/70 text-xs mt-0.5">
              Buka{" "}
              <Link to="/app/pengaturan" className="underline font-medium text-amber-300">
                Pengaturan → Kunci AI Pribadi
              </Link>{" "}
              lalu tempel key dari{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline text-amber-300">
                aistudio.google.com/apikey
              </a>{" "}
              (gratis).
            </p>
          </div>
        </div>
      )}

      {/* Panduan cara pakai */}
      <div className="mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-4">
        <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-2">Cara Pakai</p>
        <div className="flex flex-col sm:flex-row gap-3 text-xs text-slate-300">
          {[
            { n: "1", t: "Isi form di bawah, lalu klik Generate" },
            { n: "2", t: "Salin Master Prompt yang dihasilkan" },
            { n: "3", t: "Upload foto produk + paste prompt ke Gemini / ChatGPT / Midjourney" },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-2 flex-1">
              <span className="w-5 h-5 rounded-full bg-indigo-500/40 text-indigo-200 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{s.n}</span>
              <span>{s.t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">

        {/* Panel kiri — Form */}
        <div className="space-y-3">

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Kategori & Gaya</p>
            <F l="Jenis Usaha">
              <select value={productType} onChange={(e) => setProductType(e.target.value)} className="inp">
                {PRODUCT_TYPES.map((p) => <option key={p.k} value={p.k} className="text-black">{p.label}</option>)}
              </select>
            </F>
            <F l="Gaya Visual / Style">
              <select value={styleKey} onChange={(e) => setStyleKey(e.target.value)} className="inp">
                {STYLES.map((s) => <option key={s.k} value={s.k} className="text-black">{s.label}</option>)}
              </select>
              <p className="text-[10px] text-indigo-300 mt-1 italic">{styleDef.desc}</p>
            </F>
            <F l="Rasio / Ukuran Poster">
              <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="inp">
                {RATIOS.map((r) => <option key={r.k} value={r.k} className="text-black">{r.label}</option>)}
              </select>
            </F>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Info Produk</p>
            <F l="Judul / Nama Produk *">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="inp" placeholder="Misal: Sate Kulit Kriuk" />
            </F>
            <F l="Tagline / Keunggulan">
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="inp" placeholder="Kalimat pemikat singkat" />
            </F>
            <F l="Harga (opsional)">
              <input value={price} onChange={(e) => setPrice(e.target.value)} className="inp" placeholder="Misal: Rp 25.000 / porsi" />
            </F>
            <F l="Call to Action (CTA)">
              <input value={cta} onChange={(e) => setCta(e.target.value)} className="inp" />
            </F>
            <F l="Kontak / Info Tambahan">
              <input value={contact} onChange={(e) => setContact(e.target.value)} className="inp" placeholder="No. WA, alamat, promo, dll" />
            </F>
          </div>

          <button
            onClick={generate}
            disabled={!canGenerate}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition hover:opacity-90"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {loading ? "AI sedang membuat prompt..."
              : !hasKey ? "Perlu API Key Gemini"
              : "Buat Master Prompt Pemasaran"}
          </button>
        </div>

        {/* Panel kanan — Hasil */}
        <div className="space-y-3">
          {!imagePrompt && !loading && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-8 flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
              <FileText className="text-slate-600" size={48} />
              <p className="text-sm text-slate-500">Hasil prompt & caption akan tampil di sini</p>
              <p className="text-xs text-slate-600">Isi form di kiri, lalu klik Generate</p>
            </div>
          )}

          {loading && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-8 flex flex-col items-center justify-center min-h-[300px] gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-purple-500/30 border-t-purple-400 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto text-purple-300" size={20} />
              </div>
              <p className="text-sm font-semibold text-fuchsia-200">AI sedang meracik prompt terbaik...</p>
              <p className="text-xs text-slate-400">Biasanya selesai dalam 5–10 detik</p>
            </div>
          )}

          {imagePrompt && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Wand2 size={12} /> Master Image Prompt
                </p>
                <button
                  onClick={() => copyText(imagePrompt, "img")}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition"
                >
                  {copiedImg ? <Check size={12} /> : <Copy size={12} />}
                  {copiedImg ? "Tersalin!" : "Salin Prompt"}
                </button>
              </div>
              <div className="rounded-xl bg-black/30 border border-white/5 p-3 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
                {imagePrompt}
              </div>
              <p className="text-[10px] text-slate-500">
                Paste prompt ini + upload foto produk ke Gemini (gemini.google.com), ChatGPT, atau Midjourney.
              </p>
            </div>
          )}

          {caption && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                  <FileText size={12} /> Caption Media Sosial
                </p>
                <button
                  onClick={() => copyText(caption, "cap")}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition"
                >
                  {copiedCap ? <Check size={12} /> : <Copy size={12} />}
                  {copiedCap ? "Tersalin!" : "Salin Caption"}
                </button>
              </div>
              <div className="rounded-xl bg-black/30 border border-white/5 p-3 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {caption}
              </div>
              <p className="text-[10px] text-slate-500">
                Siap paste ke caption Instagram, WhatsApp Status, atau TikTok.
              </p>
            </div>
          )}

          {imagePrompt && (
            <button
              onClick={generate}
              disabled={loading}
              className="w-full rounded-xl border border-purple-500/30 text-purple-300 py-2 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-purple-500/10 transition disabled:opacity-40"
            >
              <Sparkles size={14} /> Generate Ulang
            </button>
          )}
        </div>
      </div>

      <style>{`.inp{width:100%;background:rgba(255,255,255,.08);border-radius:8px;padding:8px 10px;font-size:13px;color:white;outline:none;border:1px solid rgba(255,255,255,.12)}.inp::placeholder{color:rgba(255,255,255,.3)}.inp:focus{border-color:rgba(168,85,247,.6);background:rgba(255,255,255,.12)}`}</style>
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
