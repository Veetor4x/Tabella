import { useState } from "react";
import { canNativeShare, copyText, emailLink, nativeShare, whatsappLink, type ShareContent } from "../lib/share";
import { IconCheck } from "./icons";

/** Three quiet ways to send something: WhatsApp, email, copy (and the phone's share sheet where there is one). */
export function SharePanel({ content, copyWhat = "text", label }: { content: ShareContent; copyWhat?: "link" | "text"; label: string }) {
  const [copied, setCopied] = useState(false);
  const toCopy = copyWhat === "link" && content.url ? content.url : content.url ? `${content.text}\n\n${content.url}` : content.text;
  return (
    <div className="share-row" role="group" aria-label={label}>
      {canNativeShare() && (
        <button type="button" className="btn glass share-btn" onClick={() => void nativeShare(content)}>
          <span>Share…</span>
        </button>
      )}
      <a className="btn glass share-btn" href={whatsappLink(content)} target="_blank" rel="noreferrer">
        <span>WhatsApp</span>
      </a>
      <a className="btn glass share-btn" href={emailLink(content)}>
        <span>Email</span>
      </a>
      <button
        type="button"
        className="btn glass share-btn"
        onClick={async () => {
          setCopied(await copyText(toCopy));
          setTimeout(() => setCopied(false), 2500);
        }}
      >
        <span>{copied ? "Copied" : copyWhat === "link" ? "Copy link" : "Copy"}</span>
        {copied && <IconCheck size={15} />}
      </button>
    </div>
  );
}
