import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

/** Reads a card's QR code with the camera. Uses the phone's own reader when it has one, and a small decoder when not. */
export function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stop = false, stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setProblem("We couldn't use the camera. You can paste the code instead.");
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      const canvas = document.createElement("canvas");
      const tick = async () => {
        if (stop) return;
        try {
          let text: string | undefined;
          if (detector) text = (await detector.detect(v))[0]?.rawValue;
          else if (v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const c = canvas.getContext("2d", { willReadFrequently: true })!;
            c.drawImage(v, 0, 0);
            const img = c.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(img.data, img.width, img.height)?.data;
          }
          if (text) { stop = true; onCode(text); return; }
        } catch { /* keep looking */ }
        timer = setTimeout(tick, 120);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return (
    <div className="scanner glass">
      {problem ? <p className="status-line">{problem}</p> : <video ref={video} playsInline muted />}
      <button type="button" className="link" onClick={onClose}>Close the camera</button>
    </div>
  );
}
