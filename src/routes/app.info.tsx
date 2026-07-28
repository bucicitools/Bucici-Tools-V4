import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useDB } from "@/lib/store";

export const Route = createFileRoute("/app/info")({ component: InfoPage });

function ytEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be"))
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    return null;
  } catch {
    return null;
  }
}

function InfoPage() {
  const info = useDB((d) => d.info);
  return (
    <div className="space-y-4">
      <div className="neu p-5 flex items-center gap-3">
        <Info className="text-primary" />
        <div>
          <h1 className="font-bold">Ruang Info</h1>
          <p className="text-sm text-muted-foreground">Pengumuman & update terbaru dari BUCICI.</p>
        </div>
      </div>
      {info.length === 0 && (
        <p className="text-center text-muted-foreground py-10">Belum ada pengumuman.</p>
      )}
      {info.map((i) => {
        const yt = i.link ? ytEmbed(i.link) : null;
        return (
          <div key={i.id} className="neu p-5">
            <div className="text-xs text-muted-foreground">
              {new Date(i.createdAt).toLocaleString("id-ID")}
            </div>
            <div className="mt-2 whitespace-pre-wrap">{i.text}</div>
            {yt && (
              <div className="mt-3 aspect-video">
                <iframe
                  src={yt}
                  title="video"
                  className="w-full h-full rounded-lg"
                  allowFullScreen
                />
              </div>
            )}
            {i.link && !yt && (
              <a
                href={i.link}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Buka Tautan →
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
