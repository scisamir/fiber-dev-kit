"use client";
import { useState } from "react";
export default function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className={`copy-btn${ok ? " copy-ok" : ""}`}
      onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); }}>
      {ok ? "✓ copied" : "copy"}
    </button>
  );
}
