import symbol from "@/assets/bucici-symbol.asset.json";
import lockup from "@/assets/bucici-lockup.asset.json";

/**
 * BuciciLogo
 * - `variant="lockup"` (default): logo lengkap + teks "BUCICI" + tagline (dari file lockup permanen).
 * - `variant="symbol"`: hanya simbol persegi (untuk header sempit / avatar).
 */
export function BuciciLogo({
  size = 96,
  variant = "lockup",
  showTagline = true,
}: {
  size?: number;
  variant?: "lockup" | "symbol";
  showTagline?: boolean;
}) {
  if (variant === "symbol") {
    return (
      <img
        src="/icon-192.png"
        alt="BUCICI"
        style={{ height: size, width: size }}
        className="rounded-2xl object-cover drop-shadow-[0_4px_16px_rgba(30,80,180,0.35)]"
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src="/logo.png"
        alt="BUCICI · Simple Business Buddy"
        style={{ height: size, width: "auto" }}
        className="object-contain drop-shadow-[0_4px_16px_rgba(30,80,180,0.25)]"
      />
      {/* Tagline sudah tercetak di lockup; opsi ini disediakan bila logo dipakai monokrom lain */}
      {showTagline === false && null}
    </div>
  );
}
