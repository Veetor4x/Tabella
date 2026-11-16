import QRCode from "qrcode";

/** A QR code drawn as one crisp SVG path (no image file, prints sharply). */
export function Qr({ value, size = 160, label }: { value: string; size?: number; label?: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, data = qr.modules.data;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!data[y * n + x]) { x++; continue; }
      let run = 1;
      while (x + run < n && data[y * n + x + run]) run++;
      d += `M${x + 4} ${y + 4}h${run}v1h-${run}z`; // 4 cells of quiet space around it
      x += run;
    }
  }
  const box = n + 8;
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${box} ${box}`} shapeRendering="crispEdges" role="img" aria-label={label ?? "QR code"}>
      <rect width={box} height={box} fill="#fff" />
      <path d={d} fill="#14161b" />
    </svg>
  );
}
