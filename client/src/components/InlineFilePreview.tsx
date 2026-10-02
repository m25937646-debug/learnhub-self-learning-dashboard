import React, { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { getSessionHeaders } from "@/lib/session-headers";
import { isProtectedAssetUrl, resolveAssetPreviewUrl } from "@/lib/protected-file";

type PreviewRequest = { url: string; name?: string; mime?: string };
type Props = { request: PreviewRequest | null; onClose: () => void };

type LoadedPreview = { kind: "text" | "html" | "image" | "audio" | "video" | "pdf" | "binary"; value: string };

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

function hexSample(bytes: Uint8Array): string {
  const shown = bytes.slice(0, 256);
  const rows: string[] = [];
  for (let offset = 0; offset < shown.length; offset += 16) {
    const row = shown.slice(offset, offset + 16);
    rows.push(`${offset.toString(16).padStart(8, "0")}  ${Array.from(row, byte => byte.toString(16).padStart(2, "0")).join(" ")}`);
  }
  return rows.join("\n") || "(الملف فارغ)";
}

export default function InlineFilePreview({ request, onClose }: Props) {
  const [src, setSrc] = useState("");
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSrc("");
    setLoaded(null);
    setError("");
    if (!request?.url) return () => { active = false; };
    setLoading(true);
    const prepare = async () => {
      try {
        const target = isProtectedAssetUrl(request.url) ? await resolveAssetPreviewUrl(request.url) : request.url;
        if (!active) return;
        setSrc(target);
        if (target.startsWith("data:text/")) {
          const comma = target.indexOf(",");
          setLoaded({ kind: "text", value: comma >= 0 ? decodeURIComponent(target.slice(comma + 1)) : "" });
          return;
        }
        const response = await fetch(target, { credentials: "include", headers: getSessionHeaders() });
        if (!response.ok) throw new Error(`تعذر فتح الملف (${response.status}).`);
        const contentType = (response.headers.get("content-type") || request.mime || "application/octet-stream").split(";", 1)[0].toLowerCase();
        if (contentType === "text/html") {
          const html = await response.text();
          const parsed = new DOMParser().parseFromString(html, "text/html");
          const styles = Array.from(parsed.head.querySelectorAll("style")).map(style => style.outerHTML).join("");
          if (active) setLoaded({ kind: "html", value: `${styles}${parsed.body.innerHTML}` });
        } else if (contentType.startsWith("text/") || /json|xml|yaml|javascript/.test(contentType)) {
          if (active) setLoaded({ kind: "text", value: await response.text() });
        } else if (contentType.startsWith("image/")) {
          if (active) setLoaded({ kind: "image", value: target });
        } else if (contentType.startsWith("audio/")) {
          if (active) setLoaded({ kind: "audio", value: target });
        } else if (contentType.startsWith("video/")) {
          if (active) setLoaded({ kind: "video", value: target });
        } else if (contentType === "application/pdf") {
          if (active) setLoaded({ kind: "pdf", value: target });
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (active) setLoaded({ kind: "binary", value: hexSample(bytes) });
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر تجهيز المعاينة.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void prepare();
    return () => { active = false; };
  }, [request?.url, request?.mime]);

  if (!request) return null;
  const title = request.name || "معاينة الملف";
  return (
    <div role="dialog" aria-modal="true" aria-label={`معاينة ${title}`} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "#07111f", color: "#e5e7eb" }}>
      <header style={{ minHeight: 54, display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid #334155", background: "#111827" }}>
        <strong style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{title}</strong>
        <button type="button" onClick={onClose} aria-label="إغلاق المعاينة" style={{ display: "inline-flex", border: 0, borderRadius: 9, padding: 8, background: "#263449", color: "#F3F4F6", cursor: "pointer" }}><X size={18} /></button>
      </header>
      <main style={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto", display: "grid", placeItems: "center", padding: 14 }}>
        {loading && <div role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#44e0c2", fontSize: 13 }}><Loader2 size={18} className="animate-spin" /> جاري فتح المعاينة…</div>}
        {error && <div role="alert" style={{ width: "min(620px,100%)", padding: 22, border: "1px solid #7f1d1d", borderRadius: 16, background: "#1f2937", color: "#fecaca", textAlign: "center", lineHeight: 1.8 }}>{error}</div>}
        {loaded?.kind === "text" && <pre style={{ width: "min(1100px,100%)", margin: 0, padding: 20, boxSizing: "border-box", border: "1px solid #334155", borderRadius: 12, background: "#08111f", color: "#e5e7eb", whiteSpace: "pre-wrap", overflowWrap: "anywhere", direction: "ltr", textAlign: "start", font: "13px/1.7 ui-monospace,monospace" }}>{loaded.value || "(الملف النصي فارغ)"}</pre>}
        {loaded?.kind === "html" && <div style={{ width: "min(1100px,100%)", minHeight: "100%", padding: 18, boxSizing: "border-box", borderRadius: 12, background: "#111827", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: loaded.value }} />}
        {loaded?.kind === "image" && <img src={loaded.value} alt={title} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 100px)", objectFit: "contain" }} />}
        {loaded?.kind === "audio" && <audio src={loaded.value} controls autoPlay style={{ width: "min(760px,100%)" }} />}
        {loaded?.kind === "video" && <video src={loaded.value} controls autoPlay style={{ maxWidth: "100%", maxHeight: "calc(100vh - 100px)" }} />}
        {loaded?.kind === "pdf" && <object data={loaded.value} type="application/pdf" style={{ width: "100%", height: "calc(100vh - 100px)", borderRadius: 12, background: "#fff" }}><p>لا يدعم المتصفح عرض PDF مباشرة.</p></object>}
        {loaded?.kind === "binary" && <pre style={{ width: "min(1100px,100%)", margin: 0, padding: 20, boxSizing: "border-box", border: "1px solid #334155", borderRadius: 12, background: "#08111f", color: "#e5e7eb", whiteSpace: "pre-wrap", font: "13px/1.7 ui-monospace,monospace" }}>{loaded.value}</pre>}
      </main>
    </div>
  );
}
