import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Eraser,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Table2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  accent?: string;
  minHeight?: number;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  toolbarEnabled?: boolean;
  ariaLabel?: string;
};

const ALLOWED_TAGS = new Set([
  "p", "div", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "td", "th", "hr", "span", "font",
]);
const DANGEROUS_TAGS = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "form"]);
const ALLOWED_STYLE_PROPERTIES = new Set([
  "color", "background-color", "font-size", "font-weight", "font-style",
  "text-decoration", "text-align", "vertical-align", "border", "border-collapse",
  "padding", "margin", "min-width", "width",
]);

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

export function sanitizeRichTextHTML(value: unknown): string {
  const source = String(value ?? "");
  if (typeof DOMParser === "undefined") return escapeHtml(source).replace(/\r?\n/g, "<br>");
  const parsed = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return "";

  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tag)) return "";
    const children = Array.from(element.childNodes).map(clean).join("");
    if (!ALLOWED_TAGS.has(tag)) return children;

    const attributes: string[] = [];
    const styles: string[] = [];
    for (const property of Array.from(ALLOWED_STYLE_PROPERTIES)) {
      const styleValue = element.style.getPropertyValue(property).trim();
      if (styleValue && !/(?:url\s*\(|expression\s*\(|javascript:)/i.test(styleValue)) {
        styles.push(`${property}:${styleValue}`);
      }
    }
    if (styles.length) attributes.push(`style="${escapeHtml(styles.join(";"))}"`);
    if ((tag === "td" || tag === "th") && element.hasAttribute("colspan")) {
      const span = Math.max(1, Math.min(12, Number(element.getAttribute("colspan")) || 1));
      attributes.push(`colspan="${span}"`);
    }
    if ((tag === "td" || tag === "th") && element.hasAttribute("rowspan")) {
      const span = Math.max(1, Math.min(12, Number(element.getAttribute("rowspan")) || 1));
      attributes.push(`rowspan="${span}"`);
    }
    if (tag === "font") {
      const size = Number(element.getAttribute("size"));
      if (Number.isInteger(size) && size >= 1 && size <= 7) attributes.push(`size="${size}"`);
      const color = element.getAttribute("color") || "";
      if (/^#[0-9a-f]{3,8}$/i.test(color)) attributes.push(`color="${color}"`);
    }

    const attrs = attributes.length ? ` ${attributes.join(" ")}` : "";
    if (tag === "br" || tag === "hr") return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>${children}</${tag}>`;
  };

  return Array.from(root.childNodes).map(clean).join("");
}

function toSafeEditorHTML(value: unknown): string {
  const source = String(value ?? "");
  if (!source) return "";
  if (/<\/?(?:p|div|br|strong|b|em|i|u|s|ul|ol|li|h[1-4]|blockquote|pre|code|table|thead|tbody|tr|td|th|hr|span|font)\b/i.test(source)) {
    return sanitizeRichTextHTML(source);
  }
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
    .join("");
}

export function richTextToPlainText(value: unknown): string {
  const source = String(value ?? "");
  if (typeof DOMParser === "undefined") {
    return source
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-4]|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .trim();
  }
  const parsed = new DOMParser().parseFromString(toSafeEditorHTML(source), "text/html");
  const blockTags = new Set(["div", "p", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "tr"]);
  const extract = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "br" || tag === "hr") return "\n";
    const children = Array.from(element.childNodes).map(extract).join("");
    if (blockTags.has(tag)) return `\n${children}\n`;
    if (tag === "td" || tag === "th") return `${children} `;
    return children;
  };
  return Array.from(parsed.body.childNodes)
    .map(extract)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function RichTextDisplay({ value, className, style }: Pick<Props, "value" | "className" | "style">) {
  const html = toSafeEditorHTML(value);
  return (
    <div
      className={className}
      style={{ lineHeight: 1.8, overflowWrap: "anywhere", ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function RichTextEditor({
  value = "",
  onChange,
  onFocus,
  onBlur,
  onClick,
  onKeyDown,
  placeholder = "ابدأ الكتابة هنا…",
  className = "",
  style = {},
  accent = "#38BFA7",
  minHeight = 110,
  disabled = false,
  readOnly = false,
  compact = false,
  toolbarEnabled = true,
  ariaLabel = "محرر نص منسّق",
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const readOnlyMode = disabled || readOnly;
  const handleEditorBoundaryBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    const editor = editorRef.current;
    if (editor) {
      const cleanHTML = sanitizeRichTextHTML(editor.innerHTML);
      if (editor.innerHTML !== cleanHTML) editor.innerHTML = cleanHTML;
      onChange?.(cleanHTML);
    }
    setToolbarOpen(false);
    setTableOpen(false);
    onBlur?.(event);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = toSafeEditorHTML(value);
    const editorHasFocus = editor === document.activeElement || editor.contains(document.activeElement);
    // The parent persists on every input. Replacing innerHTML while focused
    // resets the browser selection and can break Arabic/IME composition.
    if (editorHasFocus) return;
    if (sanitizeRichTextHTML(editor.innerHTML) !== next) editor.innerHTML = next;
  }, [value]);

  const rememberSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (!editor || !selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const saved = savedRangeRef.current;
    if (selection && saved) {
      try {
        selection.removeAllRanges();
        selection.addRange(saved);
      } catch {
        // The saved selection may have become detached after an external value update.
      }
    }
  }, []);

  const syncValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanHTML = sanitizeRichTextHTML(editor.innerHTML);
    onChange?.(cleanHTML);
    rememberSelection();
  }, [onChange, rememberSelection]);

  const runCommand = useCallback((command: string, commandValue?: string) => {
    if (readOnlyMode) return;
    restoreSelection();
    document.execCommand(command, false, commandValue);
    syncValue();
  }, [readOnlyMode, restoreSelection, syncValue]);

  const insertTable = () => {
    if (readOnlyMode) return;
    const rows = Math.max(1, Math.min(12, Number(tableRows) || 1));
    const columns = Math.max(1, Math.min(8, Number(tableColumns) || 1));
    const cells = Array.from({ length: rows }, () =>
      `<tr>${Array.from({ length: columns }, () => `<td style="border:1px solid #94a3b8;padding:6px;min-width:48px"><br></td>`).join("")}</tr>`,
    ).join("");
    restoreSelection();
    document.execCommand("insertHTML", false, `<table style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>${cells}</tbody></table><p><br></p>`);
    syncValue();
    setTableOpen(false);
  };

  const toolButton = (label: string, icon: React.ReactNode, action: () => void) => (
    <button
      key={label}
      type="button"
      title={label}
      aria-label={label}
      disabled={readOnlyMode}
      onMouseDown={event => event.preventDefault()}
      onClick={action}
      style={{
        width: 30,
        height: 30,
        display: "grid",
        placeItems: "center",
        padding: 0,
        borderRadius: 7,
        border: "1px solid rgba(148,163,184,.35)",
        background: "rgba(15,23,42,.18)",
        color: "inherit",
        cursor: readOnlyMode ? "not-allowed" : "pointer",
        opacity: readOnlyMode ? 0.45 : 1,
      }}
    >
      {icon}
    </button>
  );

  const toolbar = (
    <div
      className="richTextToolbar"
      role="toolbar"
      aria-label="أدوات تنسيق النص"
      style={{
        position: "relative",
        zIndex: compact ? 100 : 1,
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
        padding: 6,
        borderBottom: compact ? undefined : "1px solid rgba(148,163,184,.24)",
        border: compact ? "1px solid rgba(148,163,184,.4)" : undefined,
        borderRadius: compact ? 10 : undefined,
        background: "#172033",
        color: "#F3F4F6",
        boxShadow: compact ? "0 10px 30px rgba(0,0,0,.4)" : undefined,
      }}
    >
      {toolButton("تراجع", <Undo2 size={14} />, () => runCommand("undo"))}
      {toolButton("إعادة", <Redo2 size={14} />, () => runCommand("redo"))}
      <span style={{ width: 1, height: 22, background: "rgba(148,163,184,.35)", margin: "0 2px" }} />
      {toolButton("عريض", <Bold size={14} />, () => runCommand("bold"))}
      {toolButton("مائل", <Italic size={14} />, () => runCommand("italic"))}
      {toolButton("تحته خط", <Underline size={14} />, () => runCommand("underline"))}
      <select
        aria-label="حجم الخط"
        title="حجم الخط"
        defaultValue="3"
        disabled={readOnlyMode}
        onMouseDown={rememberSelection}
        onChange={event => runCommand("fontSize", event.target.value)}
        style={{ height: 30, maxWidth: 94, borderRadius: 7, border: "1px solid rgba(148,163,184,.35)", background: "#172033", color: "#F3F4F6", fontSize: 10 }}
      >
        <option value="2">صغير</option>
        <option value="3">عادي</option>
        <option value="4">كبير</option>
        <option value="5">عنوان</option>
        <option value="6">عنوان كبير</option>
      </select>
      <select
        aria-label="نوع الفقرة"
        title="نوع الفقرة"
        defaultValue="p"
        disabled={readOnlyMode}
        onMouseDown={rememberSelection}
        onChange={event => runCommand("formatBlock", event.target.value)}
        style={{ height: 30, maxWidth: 104, borderRadius: 7, border: "1px solid rgba(148,163,184,.35)", background: "#172033", color: "#F3F4F6", fontSize: 10 }}
      >
        <option value="p">فقرة</option>
        <option value="h2">عنوان رئيسي</option>
        <option value="h3">عنوان فرعي</option>
        <option value="blockquote">اقتباس</option>
      </select>
      <label title="لون النص" style={{ width: 30, height: 30, display: "grid", placeItems: "center", position: "relative", borderRadius: 7, border: "1px solid rgba(148,163,184,.35)", cursor: readOnlyMode ? "not-allowed" : "pointer" }}>
        <Type size={14} />
        <input type="color" aria-label="اختيار لون النص" defaultValue="#f4f1e8" disabled={readOnlyMode} onMouseDown={rememberSelection} onChange={event => runCommand("foreColor", event.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
      </label>
      <label title="لون تمييز النص" style={{ width: 30, height: 30, display: "grid", placeItems: "center", position: "relative", borderRadius: 7, border: "1px solid rgba(148,163,184,.35)", cursor: readOnlyMode ? "not-allowed" : "pointer" }}>
        <Highlighter size={14} />
        <input type="color" aria-label="اختيار لون تمييز النص" defaultValue="#ffe066" disabled={readOnlyMode} onMouseDown={rememberSelection} onChange={event => runCommand("hiliteColor", event.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
      </label>
      {toolButton("قائمة نقطية", <List size={14} />, () => runCommand("insertUnorderedList"))}
      {toolButton("قائمة مرقمة", <ListOrdered size={14} />, () => runCommand("insertOrderedList"))}
      <div style={{ position: "relative" }}>
        {toolButton("إدراج جدول", <Table2 size={14} />, () => setTableOpen(open => !open))}
        {tableOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", insetInlineStart: 0, zIndex: 110, display: "grid", gridTemplateColumns: "1fr 1fr auto", alignItems: "end", gap: 6, width: 245, padding: 9, borderRadius: 9, border: "1px solid rgba(148,163,184,.45)", background: "#172033", boxShadow: "0 10px 28px rgba(0,0,0,.4)" }}>
            <label style={{ display: "grid", gap: 3, fontSize: 9, color: "#CBD5E1" }}>صفوف
              <input type="number" min={1} max={12} value={tableRows} onChange={event => setTableRows(Number(event.target.value))} style={{ width: "100%", boxSizing: "border-box", height: 28, borderRadius: 5, border: "1px solid #475569", background: "#0F172A", color: "white", padding: "0 6px" }} />
            </label>
            <label style={{ display: "grid", gap: 3, fontSize: 9, color: "#CBD5E1" }}>أعمدة
              <input type="number" min={1} max={8} value={tableColumns} onChange={event => setTableColumns(Number(event.target.value))} style={{ width: "100%", boxSizing: "border-box", height: 28, borderRadius: 5, border: "1px solid #475569", background: "#0F172A", color: "white", padding: "0 6px" }} />
            </label>
            <button type="button" onMouseDown={event => event.preventDefault()} onClick={insertTable} style={{ height: 28, border: 0, borderRadius: 5, padding: "0 8px", background: accent, color: "#10201E", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>إدراج</button>
          </div>
        )}
      </div>
      {toolButton("إدراج خط أفقي", <Minus size={15} />, () => runCommand("insertHorizontalRule"))}
      {toolButton("مسح تنسيق التحديد", <Eraser size={14} />, () => runCommand("removeFormat"))}
      {compact && <span style={{ marginInlineStart: "auto", fontSize: 9, color: "#CBD5E1" }}>أدوات النص</span>}
    </div>
  );

  const outerStyle: React.CSSProperties = {
    width: style.width || "100%",
    margin: style.margin,
    border: style.border || "1px solid rgba(148,163,184,.38)",
    borderColor: style.borderColor || `${accent}66`,
    borderRadius: style.borderRadius || 10,
    background: style.background || "rgba(15,23,42,.16)",
    color: style.color || "inherit",
    position: "relative",
    boxSizing: "border-box",
    opacity: readOnlyMode && disabled ? 0.75 : 1,
  };
  const editorOverrides: React.CSSProperties = { ...style };
  delete editorOverrides.width;
  delete editorOverrides.margin;
  delete editorOverrides.border;
  delete editorOverrides.borderColor;
  delete editorOverrides.borderRadius;
  delete editorOverrides.background;
  const editorStyle: React.CSSProperties = {
    minHeight: style.minHeight || minHeight,
    width: "100%",
    boxSizing: "border-box",
    padding: style.padding || "10px 12px",
    outline: "none",
    overflowY: "auto",
    overflowWrap: "anywhere",
    border: 0,
    background: "transparent",
    color: style.color || "inherit",
    lineHeight: style.lineHeight || 1.8,
    ...editorOverrides,
  };

  return (
    <div className={`richTextEditor ${className}`} style={outerStyle} onBlur={handleEditorBoundaryBlur} onClick={onClick}>
      <style>{`.richTextEditorContent:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}.richTextEditorContent h2{font-size:1.5em;margin:.6em 0}.richTextEditorContent h3{font-size:1.25em;margin:.55em 0}.richTextEditorContent blockquote{border-inline-start:3px solid ${accent};padding-inline-start:10px;margin:8px 0;color:inherit;opacity:.88}.richTextEditorContent table{max-width:100%;table-layout:fixed}.richTextEditorContent td,.richTextEditorContent th{overflow-wrap:anywhere}`}</style>
      {toolbarEnabled && toolbarOpen && toolbar}
      <div
        ref={editorRef}
        className="richTextEditorContent"
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-readonly={readOnlyMode}
        data-placeholder={placeholder}
        dir="auto"
        contentEditable={!readOnlyMode}
        suppressContentEditableWarning
        onInput={syncValue}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={event => {
          if (toolbarEnabled) setToolbarOpen(true);
          onFocus?.(event);
        }}
        onKeyDown={onKeyDown}
        style={editorStyle}
      />
    </div>
  );
}
