// Web Bluetooth ESC/POS printer helper for 58mm/80mm thermal printers.
// Supports multiple Bluetooth printer profiles for maximum compatibility:
// - Serial-over-BLE (Xprinter, Sewoo, etc.): service 000018f0-...
// - Generic ESC/POS BLE (many cheap 58mm printers): 49535343-fe7d-...
// - SPP (Serial Port Profile) fallback via acceptAllDevices
const PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Xprinter/Sewoo
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Generic BLE serial
  "0000ff00-0000-1000-8000-00805f9b34fb", // Common alt UUID
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 / JDY-08 modules
];
const PRINT_CHARS = [
  "00002af1-0000-1000-8000-00805f9b34fb", // Xprinter/Sewoo char
  "49535343-8841-43f4-a8d4-ecbe34729bb3", // Generic BLE serial char
  "0000ff02-0000-1000-8000-00805f9b34fb", // Common alt char
  "0000ffe1-0000-1000-8000-00805f9b34fb", // HM-10 / JDY-08 char
];

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function enc(str: string): Uint8Array {
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

/**
 * Tries to get a writable characteristic from a connected GATT server.
 * Iterates through known service/characteristic UUID pairs for maximum
 * compatibility across different printer brands and BLE modules.
 */
async function getWritableChar(server: BTServer): Promise<BTChar> {
  // Try known service+char pairs
  for (let i = 0; i < PRINT_SERVICES.length; i++) {
    try {
      const svc = await server.getPrimaryService(PRINT_SERVICES[i]);
      // Try matching char first, then any char in the list
      for (const charUuid of PRINT_CHARS) {
        try {
          const ch = await svc.getCharacteristic(charUuid);
          return ch;
        } catch {
          // try next char uuid
        }
      }
    } catch {
      // service not found, try next
    }
  }
  throw new Error(
    "Karakteristik printer tidak ditemukan. Pastikan printer dalam mode pairing dan coba lagi.",
  );
}

export async function printBluetooth(lines: PrintLine[], width = 32): Promise<void> {
  const nav = navigator as Navigator & { bluetooth?: BTAPI };
  if (!nav.bluetooth) {
    throw new Error(
      "Perangkat/browser ini belum mendukung Web Bluetooth. Gunakan Chrome atau Edge di Android/Desktop.",
    );
  }

  // Accept all Bluetooth devices and declare all known services as optional
  // This is the most compatible approach — lets the user pick their specific printer
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINT_SERVICES,
  });

  if (!device.gatt) {
    throw new Error("Printer tidak mendukung koneksi GATT.");
  }

  const server = await device.gatt.connect();
  const char = await getWritableChar(server);
  const data = buildESCPOS(lines, width);

  // Chunk size 180 bytes with small delay for printers with slow buffers
  const CHUNK = 180;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    if (char.writeValueWithoutResponse) {
      await char.writeValueWithoutResponse(slice);
    } else {
      await char.writeValue(slice);
    }
    // Small delay between chunks to prevent buffer overflow on slow printers
    if (i + CHUNK < data.length) await sleep(20);
  }

  try {
    server.disconnect();
  } catch {
    /* ignore disconnect errors */
  }
}
