import React from "react";
import { FileText, Library } from "lucide-react";
import { openAssetInNewTab } from "@/lib/protected-file";
import { safeAssetUrl } from "@/lib/storage-url";

type SourceFile = {
  id?: string;
  name?: string;
  url?: string;
  previewUrl?: string;
  dataUrl?: string;
  storageKey?: string;
  mime?: string;
  size?: number;
};

type StudySources = {
  names?: string[];
  files?: SourceFile[];
};

type Props = {
  sources?: StudySources | null;
  accent?: string;
  compact?: boolean;
};

function formatSize(value?: number): string {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudySourcesDisplay({ sources, accent = "#E8C468", compact = false }: Props) {
  const names = Array.isArray(sources?.names) ? sources.names.filter(name => typeof name === "string" && name.trim().length > 0) : [];
  const files = Array.isArray(sources?.files) ? sources.files.filter(file => Boolean(file) && typeof file === "object") : [];
  if (!names.length && !files.length) return null;

  return (
    <section aria-label="مصادر المذاكرة" style={{ marginTop: compact ? 7 : 10, padding: compact ? "8px 9px" : "11px 12px", borderRadius: 11, border: `1px solid ${accent}44`, background: `${accent}09`, color: "#F3F4F6", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: accent, fontSize: 10, fontWeight: 900 }}><Library size={13} /> مصادر المذاكرة</div>
      {names.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>{names.map((name, index) => <span key={`${index}-${name}`} style={{ padding: "4px 7px", borderRadius: 99, background: `${accent}18`, color: "#F3F4F6", fontSize: 10 }}>{name}</span>)}</div>}
      {files.length > 0 && <div style={{ display: "grid", gap: 5, marginTop: names.length ? 8 : 7 }}>{files.map((file, index) => {
        const href = safeAssetUrl(file);
        const label = file.name || `ملف مصدر ${index + 1}`;
        return href ? (
          <button type="button" key={file.id || `${index}-${label}`} onClick={() => void openAssetInNewTab(file.previewUrl || href, label, file.mime)} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, width: "100%", border: 0, padding: 0, background: "transparent", color: "#DBEAFE", font: "inherit", fontSize: 10, textAlign: "start", cursor: "pointer" }}>
            <FileText size={13} color={accent} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>{file.size ? <small style={{ color: "#9CA3AF", flex: "0 0 auto" }}>{formatSize(file.size)}</small> : null}
          </button>
        ) : <span key={file.id || `${index}-${label}`} style={{ display: "flex", gap: 7, color: "#9CA3AF", fontSize: 10 }}><FileText size={13} color={accent} /> {label} — الرابط غير متاح</span>;
      })}</div>}
    </section>
  );
}
