// Web Bluetooth ESC/POS printer helper for 58mm/80mm thermal printers.
// Standard Serial-over-BLE profile: service 000018f0-... characteristic 00002af1-...
const PRINT_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINT_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function enc(str: string): Uint8Array {
  // Printers typically accept CP437/ISO-8859-1; TextEncoder UTF-8 works for ASCII.
  return new TextEncoder().encode(str);
}

function concat(parts: (Uint8Array | number[])[]): Uint8Array {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

export interface PrintLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  size?: "normal" | "large";
  divider?: boolean;
  cols?: [string, string]; // left/right on one line
}

export function buildESCPOS(lines: PrintLine[], width = 32): Uint8Array {
  const parts: (Uint8Array | number[])[] = [];
  parts.push([ESC, 0x40]); // init
  for (const l of lines) {
    if (l.divider) {
      parts.push(enc("-".repeat(width) + "\n"));
      continue;
    }
    parts.push([ESC, 0x61, l.align === "center" ? 1 : l.align === "right" ? 2 : 0]);
    parts.push([ESC, 0x45, l.bold ? 1 : 0]);
    parts.push([GS, 0x21, l.size === "large" ? 0x11 : 0x00]);
    if (l.cols) {
      const [a, b] = l.cols;
      const pad = Math.max(1, width - a.length - b.length);
      parts.push(enc(a + " ".repeat(pad) + b + "\n"));
    } else {
      parts.push(enc(l.text + "\n"));
    }
  }
  parts.push([LF, LF, LF]);
  parts.push([GS, 0x56, 0x42, 0x00]); // partial cut
  return concat(parts);
}

interface BTChar {
  writeValue(v: BufferSource): Promise<void>;
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
}
interface BTService {
  getCharacteristic(uuid: string): Promise<BTChar>;
}
interface BTServer {
  getPrimaryService(uuid: string): Promise<BTService>;
  disconnect(): void;
}
interface BTDevice {
  gatt?: { connect(): Promise<BTServer> };
}
interface BTAPI {
  requestDevice(o: unknown): Promise<BTDevice>;
}

export async function printBluetooth(lines: PrintLine[], width = 32): Promise<void> {
  const nav = navigator as Navigator & { bluetooth?: BTAPI };
  if (!nav.bluetooth) {
    throw new Error(
      "Perangkat/browser ini belum mendukung Web Bluetooth. Coba Chrome/Edge di Android atau desktop.",
    );
  }
  const device = await nav.bluetooth.requestDevice({
    filters: [{ services: [PRINT_SERVICE] }],
    optionalServices: [PRINT_SERVICE],
  });
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(PRINT_SERVICE);
  const char = await service.getCharacteristic(PRINT_CHAR);
  const data = buildESCPOS(lines, width);
  const CHUNK = 180;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    if (char.writeValueWithoutResponse) {
      await char.writeValueWithoutResponse(slice);
    } else {
      await char.writeValue(slice);
    }
  }
  try {
    server.disconnect();
  } catch {
    /* ignore */
  }
}
