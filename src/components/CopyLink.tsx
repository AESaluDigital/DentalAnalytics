"use client";

import { useState } from "react";

export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-box">
      <input type="text" readOnly value={url} aria-label="Link de compartilhamento" onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copiado ✓" : "Copiar link"}
      </button>
      <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Abrir</a>
    </div>
  );
}
