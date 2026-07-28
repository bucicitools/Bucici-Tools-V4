import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { currentTenant, db, useDB } from "@/lib/store";

export const Route = createFileRoute("/app/kasir/struk")({ component: StrukSettings });

function StrukSettings() {
  const t = currentTenant();
  const settings = useDB((d) => (t ? d.receipts[t.id] : undefined));
  const [form, setForm] = useState({ header: "", address: "", phone: "", social: "", footer: "" });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  function save() {
    if (!t) return;
    db.set((n) => {
      n.receipts[t.id] = form;
    });
    toast.success("Pengaturan struk tersimpan.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="neu p-5 space-y-3">
        <h2 className="font-bold">Pengaturan Struk</h2>
        {(["header", "address", "phone", "social", "footer"] as const).map((k) => (
          <label key={k} className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase">{k}</span>
            {k === "footer" || k === "address" ? (
              <textarea
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg neu-inset px-3 py-2 text-sm"
              />
            ) : (
              <input
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className="mt-1 w-full rounded-lg neu-inset px-3 py-2 text-sm"
              />
            )}
          </label>
        ))}
        <button
          onClick={save}
          className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Simpan
        </button>
      </div>

      <div className="neu p-5">
        <h2 className="font-bold mb-3">Live Preview</h2>
        <div className="bg-white rounded-lg p-4 font-mono text-xs text-black">
          <div className="text-center font-bold">{form.header || "Nama Toko"}</div>
          {form.address && (
            <div className="text-center text-[10px] whitespace-pre-wrap">{form.address}</div>
          )}
          {form.phone && <div className="text-center text-[10px]">{form.phone}</div>}
          {form.social && <div className="text-center text-[10px]">{form.social}</div>}
          <div className="border-t border-dashed my-2" />
          <div>Contoh Item x1 ............. Rp10.000</div>
          <div className="border-t border-dashed my-2" />
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>Rp10.000</span>
          </div>
          <div className="border-t border-dashed my-2" />
          <div className="text-center whitespace-pre-wrap">{form.footer || "Terima kasih"}</div>
        </div>
      </div>
    </div>
  );
}
