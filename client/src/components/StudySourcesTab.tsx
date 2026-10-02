import React, { useRef, useState } from "react";
import { FileText, Library, Upload, X } from "lucide-react";
import { openAssetInNewTab } from "@/lib/protected-file";
import { requestDeleteConfirmation } from "@/lib/delete-confirm";
import { safeAssetUrl } from "@/lib/storage-url";

type SourceFile = {
  id?: string;
  name?: string;
  url?: string;
  previewUrl?: string;
  storageKey?: string;
  mime?: string;
  size?: number;
};

type StudySources = {
  names?: string[];
  files?: SourceFile[];
};

type StoredUpload = {
  url?: string;
  previewUrl?: string;
  key?: string;
  mime?: string;
  size?: number;
};

type Props = {
  sources?: StudySources | null;
  accent: string;
  uploadAsset?: (file: File, onProgress?: (progress: number) => void) => Promise<StoredUpload | null>;
  onChange: (sources: StudySources) => void;
};

const parseSourceNames = (value: string) =>
  Array.from(new Set(value.split(/[\n,،;؛]+/).map(name => name.trim()).filter(Boolean)));

const formatSize = (value?: number) => {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function StudySourcesTab({ sources, accent, uploadAsset, onChange }: Props) {
  const [namesText, setNamesText] = useState(() => Array.isArray(sources?.names) ? sources.names.join("\n") : "");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const names = Array.isArray(sources?.names) ? sources.names : [];
  const files = Array.isArray(sources?.files) ? sources.files : [];

  const saveNames = (value: string) => {
    setNamesText(value);
    onChange({ names: parseSourceNames(value), files });
  };

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || !uploadAsset) return;
    setUploading(true);
    setStatus("");
    const added: SourceFile[] = [];
    try {
      for (const file of Array.from(fileList)) {
        setProgress(0);
        const stored = await uploadAsset(file, value => setProgress(Math.max(0, Math.min(100, Number(value) || 0))));
        if (!stored?.url && !stored?.key) continue;
          added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
            url: stored.url,
            previewUrl: stored.previewUrl,
          storageKey: stored.key,
          mime: stored.mime || file.type || "application/octet-stream",
          size: stored.size || file.size,
        });
      }
      if (added.length) {
        onChange({ names: parseSourceNames(namesText), files: [...files, ...added] });
        setStatus(`تمت إضافة ${added.length} ملف إلى المصادر.`);
      } else {
        setStatus("لم تتم إضافة أي ملف.");
      }
    } catch {
      setStatus("تعذر رفع الملف؛ حاول مرة أخرى.");
    } finally {
      setProgress(null);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeFile = (fileId?: string, index = 0) => {
    const nextFiles = files.filter((file, currentIndex) => fileId ? file.id !== fileId : currentIndex !== index);
    const label = files.find((file, currentIndex) => fileId ? file.id === fileId : currentIndex === index)?.name || "ملف المصدر";
    requestDeleteConfirmation(label, () => onChange({ names: parseSourceNames(namesText), files: nextFiles }));
  };

  return (
    <section aria-label="مصادر العنوان" style={{ padding: 16, border: `1px solid ${accent}55`, borderRadius: 14, background: `linear-gradient(135deg, ${accent}12, transparent)`, color: "#F3F4F6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent, fontWeight: 900, fontSize: 14 }}>
        <Library size={18} /> مصادر هذا العنوان · الخطوة الأولى
      </div>
      <p style={{ margin: "8px 0 14px", color: "#9CA3AF", fontSize: 12, lineHeight: 1.8 }}>
        اكتب أسماء المراجع أو ارفع ملفات المصادر. عند الضغط على أي ملف ستُفتح معاينته مباشرة بلا تنزيل.
      </p>
      <label style={{ display: "grid", gap: 6, color: "#D1D5DB", fontSize: 11, fontWeight: 800 }}>
        أسماء الكتب والمراجع
        <textarea
          value={namesText}
          onChange={event => saveNames(event.target.value)}
          placeholder="كتاب الفصل ٣، محاضرة الأسبوع…"
          aria-label="أسماء مصادر هذا العنوان"
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: "1px solid #334155", borderRadius: 9, padding: "9px 10px", color: "#F3F4F6", background: "#101923", font: "inherit", fontWeight: 500, lineHeight: 1.7 }}
        />
        <small style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 500 }}>يمكن فصل أكثر من مصدر بفاصلة أو سطر جديد.</small>
      </label>

      <input ref={inputRef} type="file" multiple hidden disabled={uploading} onChange={event => void uploadFiles(event.target.files)} />
      <button type="button" disabled={uploading || !uploadAsset} onClick={() => inputRef.current?.click()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 13, padding: "11px 12px", border: `1px dashed ${accent}99`, borderRadius: 10, background: `${accent}12`, color: accent, font: "inherit", fontSize: 11, fontWeight: 900, cursor: uploading || !uploadAsset ? "not-allowed" : "pointer", opacity: uploadAsset ? 1 : 0.55 }}>
        <Upload size={15} /> {uploading ? `جارٍ رفع الملف${progress !== null ? `… ${Math.round(progress)}%` : "…"}` : "رفع ملف أو أكثر للمصادر"}
      </button>
      {status && <div role="status" style={{ marginTop: 7, color: accent, fontSize: 10 }}>{status}</div>}

      <div style={{ marginTop: 14, color: "#D1D5DB", fontSize: 11, fontWeight: 800 }}>الملفات المحفوظة</div>
      {files.length > 0 ? (
        <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
          {files.map((file, index) => {
            const href = safeAssetUrl(file);
            const label = file.name || `ملف مصدر ${index + 1}`;
            return (
              <div key={file.id || `${index}-${label}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "7px 9px", border: "1px solid #334155", borderRadius: 9, background: "#101923" }}>
                <FileText size={15} color={accent} />
                {href ? (
                  <button type="button" onClick={() => void openAssetInNewTab(file.previewUrl || href, label, file.mime)} style={{ flex: 1, minWidth: 0, overflow: "hidden", border: 0, padding: 0, background: "transparent", color: "#DBEAFE", font: "inherit", fontSize: 11, textAlign: "start", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} title="فتح المعاينة المباشرة">
                    {label}
                  </button>
                ) : (
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", color: "#9CA3AF", fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label} — الرابط غير متاح</span>
                )}
                {file.size ? <small style={{ flex: "0 0 auto", color: "#9CA3AF", fontSize: 9 }}>{formatSize(file.size)}</small> : null}
                <button type="button" onClick={() => removeFile(file.id, index)} aria-label={`إزالة ${label} من مصادر العنوان`} title="إزالة من العنوان" style={{ display: "inline-flex", border: 0, background: "transparent", color: "#9CA3AF", cursor: "pointer", padding: 2 }}><X size={14} /></button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginTop: 9, color: "#9CA3AF", fontSize: 10 }}>لا توجد ملفات محفوظة لهذا العنوان.</div>
      )}
      {names.length === 0 && files.length === 0 && namesText.trim() === "" && <div style={{ marginTop: 9, color: "#9CA3AF", fontSize: 10 }}>أضف أسماء مصادر هذا العنوان للرجوع إليها أثناء المذاكرة.</div>}
    </section>
  );
}
