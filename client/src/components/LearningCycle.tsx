// @ts-nocheck
import React, { useMemo, useState } from "react";
import { AlertTriangle, Brain, CheckCircle2, ChevronDown, Clock3, Lightbulb, RotateCcw, Sparkles, Target } from "lucide-react";

const REVIEW_DAYS = [1, 3, 7, 14, 30];
const REVIEW_LABELS = ["غدًا", "بعد ٣ أيام", "بعد أسبوع", "بعد أسبوعين", "بعد شهر"];
const ERROR_TYPES = [
  ["memory", "لم أتذكر المعلومة"],
  ["confusion", "خلطت بين مفهومين"],
  ["application", "فهمت القاعدة لكن أخطأت في التطبيق"],
  ["attention", "قرأت السؤال بسرعة"],
  ["hint", "احتجت إلى تلميح"],
];

const emptyLearning = title => ({
  objective: `أستطيع شرح الفكرة الأساسية في «${title}» وتطبيقها في مثال جديد.`,
  pretest: "",
  pretestConfidence: 3,
  recall: "",
  application: "",
  explanation: "",
  confidence: 3,
  stageDone: {},
  mistakes: [],
  reviews: [],
});

const mergeLearning = (title, learning) => ({
  ...emptyLearning(title),
  ...(learning && typeof learning === "object" ? learning : {}),
  stageDone: { ...(learning?.stageDone || {}) },
  mistakes: Array.isArray(learning?.mistakes) ? learning.mistakes : [],
  reviews: Array.isArray(learning?.reviews) ? learning.reviews : [],
});

const dateOnly = value => {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 10);
};

const addDays = (value, days) => {
  const date = new Date(value || Date.now());
  date.setDate(date.getDate() + days);
  return dateOnly(date);
};

const formatDate = value => {
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
};

const card = { border: "1px solid rgba(128,167,212,.18)", borderRadius: 18, background: "rgba(15,28,48,.72)", padding: 16 };
const label = { display: "block", marginBottom: 7, color: "#DCE9FA", fontSize: 12, fontWeight: 900 };
const textarea = { width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 78, border: "1px solid rgba(128,167,212,.22)", borderRadius: 12, padding: 11, color: "#EAF3FF", background: "rgba(5,14,27,.52)", font: "inherit", lineHeight: 1.8 };

export default function LearningCycle({ subtopic, accent = "#44E0C2", onChange }) {
  const [openSection, setOpenSection] = useState("diagnose");
  const [collapsed, setCollapsed] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [errorType, setErrorType] = useState("memory");
  const learning = useMemo(() => mergeLearning(subtopic.title, subtopic.learning), [subtopic.title, subtopic.learning]);
  const today = dateOnly();
  const started = subtopic.dateStarted || today;
  const stages = [
    { id: "diagnose", title: "اختبر نفسك أولًا", icon: Target, hint: "استرجع ما تعرفه قبل أن ترى الشرح." },
    { id: "understand", title: "افهم الفكرة", icon: Lightbulb, hint: "استخدم التبويبات الموجودة للشرح والمصادر والأمثلة." },
    { id: "retrieve", title: "استرجع من الذاكرة", icon: Brain, hint: "أغلق الملاحظات واكتب ما تتذكره." },
    { id: "apply", title: "طبّق في موقف جديد", icon: Sparkles, hint: "استخدم الفكرة دون نسخ المثال السابق." },
    { id: "reflect", title: "قيّم نفسك", icon: CheckCircle2, hint: "سجّل ثقتك والخطأ الذي يحتاج إلى مراجعة." },
  ];
  const doneStages = stages.filter(stage => Boolean(learning.stageDone?.[stage.id])).length;
  const objective = learning.objective || `أستطيع شرح الفكرة الأساسية في «${subtopic.title}» وتطبيقها في مثال جديد.`;
  const persist = patch => onChange({ learning: { ...learning, ...patch } });
  const markStage = id => persist({ stageDone: { ...learning.stageDone, [id]: !learning.stageDone?.[id] } });
  const reviewRows = REVIEW_DAYS.map((days, index) => ({
    index,
    days,
    label: REVIEW_LABELS[index],
    due: addDays(started, days),
    done: Boolean(subtopic.reviewDone?.[index]),
  }));
  const dueCount = reviewRows.filter(row => !row.done && row.due <= today).length;
  const status = doneStages === stages.length && reviewRows.filter(row => row.done).length >= 3 ? "متقن مبدئيًا" : doneStages >= 4 ? "جاهز للتثبيت" : doneStages >= 2 ? "قيد البناء" : "جديد";
  const statusColor = status === "متقن مبدئيًا" ? "#44E0C2" : status === "جاهز للتثبيت" ? "#F1C878" : accent;

  const updateText = (key, value) => persist({ [key]: value });
  const saveError = () => {
    if (!draftError.trim()) return;
    const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type: errorType, note: draftError.trim(), at: new Date().toISOString() }, ...learning.mistakes].slice(0, 20);
    persist({ mistakes: next, errorNote: "" });
    setDraftError("");
  };
  const markReview = (index, rating) => {
    const nextReviewDone = [...(subtopic.reviewDone || Array(REVIEW_DAYS.length).fill(false))];
    nextReviewDone[index] = true;
    const reviews = [{ index, rating, at: new Date().toISOString() }, ...learning.reviews.filter(item => item.index !== index)];
    onChange({ reviewDone: nextReviewDone, learning: { ...learning, reviews } });
  };

  return (
    <section className="learningCycle" dir="rtl" style={{ marginTop: 18, padding: 16, border: `1px solid ${accent}44`, borderRadius: 22, background: `linear-gradient(135deg, ${accent}0d, rgba(15,28,48,.74))`, boxShadow: "0 16px 36px rgba(3,12,28,.14)" }}>
      <div role="button" tabIndex={0} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setCollapsed(value => !value); } }} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: accent, fontSize: 11, fontWeight: 900 }}><Brain size={14} /> مسار تعلم مبني على الذاكرة</span>
          <h2 style={{ margin: "6px 0 5px", color: "#EAF3FF", fontSize: 19 }}>لا تكتفِ بقراءة العنوان؛ ابنِ قدرة قابلة للاسترجاع</h2>
          <p style={{ margin: 0, color: "#9FB1C9", fontSize: 12, lineHeight: 1.8 }}>استرجع، طبّق، سجّل خطأك، ثم عد في الموعد المناسب.</p>
        </div>
        <div style={{ minWidth: 118, padding: "10px 12px", border: `1px solid ${statusColor}66`, borderRadius: 14, color: statusColor, background: `${statusColor}12`, textAlign: "center" }}><small style={{ display: "block", color: "#9FB1C9", fontSize: 10 }}>حالة العنوان</small><strong style={{ display: "block", marginTop: 4, fontSize: 13 }}>{status}</strong></div>
      </div>

      {collapsed && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, padding: "10px 12px", borderRadius: 13, color: "#9FB1C9", background: "rgba(5,14,27,.38)", fontSize: 11 }}><span>المسار مخفي — اضغط على العنوان لإظهاره</span><strong style={{ color: accent }}>{Math.round((doneStages / stages.length) * 100)}%</strong></div>}

      <div style={{ display: collapsed ? "none" : "block" }}>
      <div style={{ marginTop: 15, padding: 13, borderRadius: 15, background: "rgba(5,14,27,.44)", border: "1px solid rgba(128,167,212,.14)" }}>
        <label style={label}>هدف الإتقان</label>
        <textarea value={objective} onChange={event => updateText("objective", event.target.value)} rows={2} style={{ ...textarea, minHeight: 52 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 7, marginTop: 15 }} className="learningCycleSteps">
        {stages.map((stage, index) => { const Icon = stage.icon; const done = Boolean(learning.stageDone?.[stage.id]); return <button key={stage.id} type="button" onClick={() => setOpenSection(stage.id)} style={{ minHeight: 74, border: `1px solid ${done ? `${accent}88` : "rgba(128,167,212,.18)"}`, borderRadius: 13, padding: 8, color: done ? accent : "#9FB1C9", background: done ? `${accent}12` : "rgba(5,14,27,.38)", cursor: "pointer", font: "inherit" }}><span style={{ display: "grid", placeItems: "center", width: 22, height: 22, margin: "0 auto 6px", borderRadius: 99, color: done ? "#071311" : "#9FB1C9", background: done ? accent : "rgba(128,167,212,.17)", fontSize: 10, fontWeight: 900 }}>{done ? "✓" : index + 1}</span><Icon size={14} /><small style={{ display: "block", marginTop: 4, fontSize: 9, lineHeight: 1.4 }}>{stage.title}</small></button>; })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: "#9FB1C9", fontSize: 10 }}><span>تقدم دورة التعلم</span><strong style={{ color: accent }}>{Math.round((doneStages / stages.length) * 100)}%</strong></div>
      <div style={{ height: 6, marginTop: 5, borderRadius: 99, background: "rgba(128,167,212,.14)", overflow: "hidden" }}><div style={{ width: `${(doneStages / stages.length) * 100}%`, height: "100%", borderRadius: 99, background: accent, transition: "width .25s ease" }} /></div>

      <div style={{ display: "grid", gap: 10, marginTop: 15 }}>
        <section style={card}>
          <button type="button" onClick={() => setOpenSection(openSection === "diagnose" ? "" : "diagnose")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0, border: 0, color: "#EAF3FF", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "start" }}><span><strong>1. اختبار قبلي قصير</strong><small style={{ display: "block", marginTop: 4, color: "#9FB1C9", fontSize: 10 }}>ماذا تعرف عن «{subtopic.title}» قبل أن تبدأ؟</small></span><ChevronDown size={16} style={{ transform: openSection === "diagnose" ? "rotate(180deg)" : "none" }} /></button>
          {openSection === "diagnose" && <div style={{ marginTop: 13 }}><label style={label}>اكتب ما تتذكره الآن، حتى لو كان ناقصًا</label><textarea value={learning.pretest || ""} onChange={event => updateText("pretest", event.target.value)} placeholder="أظن أن الفكرة تعني…" style={textarea} /><label style={{ ...label, marginTop: 11 }}>ما مدى ثقتك؟ <span style={{ color: accent }}>{learning.pretestConfidence}/5</span></label><input type="range" min="1" max="5" value={learning.pretestConfidence || 3} onChange={event => updateText("pretestConfidence", Number(event.target.value))} style={{ width: "100%", accentColor: accent }} /><button type="button" onClick={() => markStage("diagnose")} style={{ marginTop: 10, border: `1px solid ${accent}66`, borderRadius: 10, padding: "8px 12px", color: accent, background: `${accent}12`, cursor: "pointer", font: "inherit", fontSize: 11 }}>{learning.stageDone?.diagnose ? "✓ تم الاختبار القبلي" : "حفظ الاختبار القبلي"}</button></div>}
        </section>

        <section style={card}>
          <button type="button" onClick={() => setOpenSection(openSection === "understand" ? "" : "understand")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0, border: 0, color: "#EAF3FF", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "start" }}><span><strong>2. افهم الفكرة دون حشو</strong><small style={{ display: "block", marginTop: 4, color: "#9FB1C9", fontSize: 10 }}>اقرأ بطاقة واحدة أو راجع التبويب المناسب، ثم سجّل ما اتضح لك.</small></span><ChevronDown size={16} style={{ transform: openSection === "understand" ? "rotate(180deg)" : "none" }} /></button>
          {openSection === "understand" && <div style={{ marginTop: 13 }}><div style={{ padding: "10px 12px", borderRadius: 11, color: "#D8E6F5", background: `${accent}0d`, border: `1px solid ${accent}22`, fontSize: 11, lineHeight: 1.8 }}>استخدم الشرح والمصادر الموجودة أسفل هذه الدورة في التبويبات. لا تحتاج إلى قراءة كل شيء؛ ابحث عن الفكرة التي تخدم هدف الإتقان فقط.</div><button type="button" onClick={() => markStage("understand")} style={{ marginTop: 10, border: `1px solid ${accent}66`, borderRadius: 10, padding: "8px 12px", color: accent, background: `${accent}12`, cursor: "pointer", font: "inherit", fontSize: 11 }}>{learning.stageDone?.understand ? "✓ تم الفهم المبدئي" : "سجل أنني فهمت الفكرة"}</button></div>}
        </section>

        <section style={card}>
          <button type="button" onClick={() => setOpenSection(openSection === "retrieve" ? "" : "retrieve")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0, border: 0, color: "#EAF3FF", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "start" }}><span><strong>2. استرجاع من الذاكرة</strong><small style={{ display: "block", marginTop: 4, color: "#9FB1C9", fontSize: 10 }}>أخفِ التبويبات واكتب الفكرة بطريقتك.</small></span><ChevronDown size={16} style={{ transform: openSection === "retrieve" ? "rotate(180deg)" : "none" }} /></button>
          {openSection === "retrieve" && <div style={{ marginTop: 13 }}><label style={label}>ماذا تتذكر عن الفكرة الأساسية؟</label><textarea value={learning.recall || ""} onChange={event => updateText("recall", event.target.value)} placeholder="من الذاكرة فقط…" style={textarea} /><button type="button" onClick={() => markStage("retrieve")} style={{ marginTop: 10, border: `1px solid ${accent}66`, borderRadius: 10, padding: "8px 12px", color: accent, background: `${accent}12`, cursor: "pointer", font: "inherit", fontSize: 11 }}>{learning.stageDone?.retrieve ? "✓ تم الاسترجاع" : "حفظ الاسترجاع"}</button></div>}
        </section>

        <section style={card}>
          <button type="button" onClick={() => setOpenSection(openSection === "apply" ? "" : "apply")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0, border: 0, color: "#EAF3FF", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "start" }}><span><strong>3. تطبيق في مثال جديد</strong><small style={{ display: "block", marginTop: 4, color: "#9FB1C9", fontSize: 10 }}>لا تنسخ المثال الموجود في الشرح.</small></span><ChevronDown size={16} style={{ transform: openSection === "apply" ? "rotate(180deg)" : "none" }} /></button>
          {openSection === "apply" && <div style={{ marginTop: 13 }}><label style={label}>أنشئ مثالًا أو حل موقفًا جديدًا</label><textarea value={learning.application || ""} onChange={event => updateText("application", event.target.value)} placeholder="في موقف جديد، سأستخدم الفكرة عندما…" style={textarea} /><button type="button" onClick={() => markStage("apply")} style={{ marginTop: 10, border: `1px solid ${accent}66`, borderRadius: 10, padding: "8px 12px", color: accent, background: `${accent}12`, cursor: "pointer", font: "inherit", fontSize: 11 }}>{learning.stageDone?.apply ? "✓ تم التطبيق" : "حفظ التطبيق"}</button></div>}
        </section>

        <section style={card}>
          <button type="button" onClick={() => setOpenSection(openSection === "reflect" ? "" : "reflect")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0, border: 0, color: "#EAF3FF", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "start" }}><span><strong>4. تقييم الثقة وتسجيل الخطأ</strong><small style={{ display: "block", marginTop: 4, color: "#9FB1C9", fontSize: 10 }}>الإحساس بالسهولة ليس دليل إتقان؛ قارِن ثقتك بأدائك.</small></span><ChevronDown size={16} style={{ transform: openSection === "reflect" ? "rotate(180deg)" : "none" }} /></button>
          {openSection === "reflect" && <div style={{ marginTop: 13 }}><label style={label}>اشرح الفكرة لشخص آخر بكلماتك</label><textarea value={learning.explanation || ""} onChange={event => updateText("explanation", event.target.value)} placeholder="لو شرحتها لشخص آخر سأقول…" style={textarea} /><label style={{ ...label, marginTop: 11 }}>ثقتك بعد المحاولة: <span style={{ color: accent }}>{learning.confidence}/5</span></label><input type="range" min="1" max="5" value={learning.confidence || 3} onChange={event => updateText("confidence", Number(event.target.value))} style={{ width: "100%", accentColor: accent }} /><div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr) auto", gap: 8, marginTop: 13 }} className="learningErrorForm"><select value={errorType} onChange={event => setErrorType(event.target.value)} style={{ ...textarea, minHeight: 42, padding: 8 }} aria-label="نوع الخطأ">{ERROR_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select><input value={draftError} onChange={event => setDraftError(event.target.value)} placeholder="ما الذي تريد تثبيته؟" style={{ ...textarea, minHeight: 42 }} /><button type="button" onClick={saveError} style={{ border: `1px solid ${accent}66`, borderRadius: 10, color: accent, background: `${accent}12`, cursor: "pointer", font: "inherit", fontSize: 11, padding: "0 12px" }}>سجّل الخطأ</button></div><button type="button" onClick={() => markStage("reflect")} style={{ marginTop: 10, border: `1px solid ${accent}66`, borderRadius: 10, padding: "8px 12px", color: accent, background: `${accent}12`, cursor: "pointer", font: "inherit", fontSize: 11 }}>{learning.stageDone?.reflect ? "✓ تم التقييم" : "حفظ التقييم"}</button>{learning.mistakes.length > 0 && <div style={{ marginTop: 14, display: "grid", gap: 6 }}><strong style={{ color: "#F1C878", fontSize: 11 }}><AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> أخطائي التي سأراجعها</strong>{learning.mistakes.slice(0, 3).map(item => <div key={item.id} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(201,138,59,.08)", color: "#D8C7A2", fontSize: 11 }}>{ERROR_TYPES.find(([value]) => value === item.type)?.[1] || "ملاحظة"}: {item.note}</div>)}</div>}</div>}
        </section>
      </div>

      <section style={{ ...card, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><strong style={{ display: "flex", alignItems: "center", gap: 6, color: "#EAF3FF", fontSize: 14 }}><RotateCcw size={15} color={accent} /> المراجعة المتباعدة</strong><small style={{ display: "block", marginTop: 5, color: "#9FB1C9", fontSize: 10 }}>الموعد يتحرك بناءً على محاولتك، لا على مجرد فتح الصفحة.</small></div>{dueCount > 0 && <span style={{ color: "#F1C878", fontSize: 11, fontWeight: 900 }}>{dueCount} مراجعة مستحقة الآن</span>}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 7, marginTop: 13 }} className="learningReviewGrid">{reviewRows.map(row => <div key={row.index} style={{ padding: 9, borderRadius: 11, border: `1px solid ${row.done ? `${accent}66` : row.due <= today ? "rgba(241,200,120,.5)" : "rgba(128,167,212,.16)"}`, background: row.done ? `${accent}0d` : "rgba(5,14,27,.3)" }}><small style={{ display: "block", color: row.done ? accent : row.due <= today ? "#F1C878" : "#9FB1C9", fontSize: 9 }}>{row.done ? "✓ تمت" : row.due <= today ? "مستحقة" : "لاحقًا"}</small><strong style={{ display: "block", marginTop: 4, color: "#EAF3FF", fontSize: 11 }}>{row.label}</strong><small style={{ display: "block", marginTop: 3, color: "#9FB1C9", fontSize: 9 }}>{formatDate(row.due)}</small>{!row.done && row.due <= today && <button type="button" onClick={() => markReview(row.index, "recalled")} style={{ width: "100%", marginTop: 7, padding: "5px 4px", border: `1px solid ${accent}66`, borderRadius: 7, color: accent, background: `${accent}0d`, cursor: "pointer", font: "inherit", fontSize: 9 }}>استرجعتها</button>}</div>)}</div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, color: "#9FB1C9", fontSize: 10 }}><Clock3 size={13} color={accent} /> أكمل دورة قصيرة اليوم، ثم دع الذاكرة تعمل بين الجلسات. <span style={{ color: accent, fontWeight: 900 }}>{doneStages}/{stages.length} مراحل</span></div>
      </div>
    </section>
  );
}
