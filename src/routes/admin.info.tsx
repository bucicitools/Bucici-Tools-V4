import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db, uid, useDB } from "@/lib/store";

export const Route = createFileRoute("/admin/info")({
  component: InfoPostPage,
});

function InfoPostPage() {
  const info = useDB((d) => d.info);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");

  function publish() {
    if (!text.trim()) return toast.error("Isi teks pengumuman.");
    db.set((n) => {
      n.info.unshift({
        id: uid("inf"),
        text: text.trim(),
        link: link.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
    });
    setText("");
    setLink("");
    toast.success("Info berhasil dipublikasikan ke semua tenant.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Info Post</h1>
        <p className="text-sm text-muted-foreground">
          Broadcast pengumuman & tautan ke seluruh Ruang Info tenant.
        </p>
      </div>

      <div className="neu p-5 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Teks pengumuman</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg neu-inset px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">
            Link (opsional — YouTube di-embed, lainnya jadi landing baru)
          </span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="mt-1 w-full rounded-lg neu-inset px-3 py-2"
            placeholder="https://..."
          />
        </label>
        <button
          onClick={publish}
          className="flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          <Send size={16} /> Publikasikan
        </button>
      </div>

      <div className="space-y-3">
        {info.length === 0 && <p className="text-sm text-muted-foreground">Belum ada info.</p>}
        {info.map((i) => (
          <div key={i.id} className="neu p-4 flex items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">
                {new Date(i.createdAt).toLocaleString("id-ID")}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{i.text}</div>
              {i.link && (
                <a
                  className="mt-2 inline-block text-xs text-primary-glow underline break-all"
                  href={i.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {i.link}
                </a>
              )}
            </div>
            <button
              onClick={() =>
                db.set((n) => {
                  n.info = n.info.filter((x) => x.id !== i.id);
                })
              }
              className="text-destructive hover:bg-destructive/10 rounded-lg p-2"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
