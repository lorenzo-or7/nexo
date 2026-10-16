"use client";
import { Lock } from "lucide-react";
import * as React from "react";

/** Só aparece quando a página realmente foi aberta por HTTPS (verificado no navegador, não presumido). */
export function SecureConnectionBadge() {
  const [secure, setSecure] = React.useState(false);
  React.useEffect(() => setSecure(window.location.protocol === "https:"), []);
  if (!secure) return null;
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-field/60 px-2.5 py-1">
      <Lock aria-hidden className="size-3 text-positive" />
      Conexão protegida por HTTPS
    </li>
  );
}
