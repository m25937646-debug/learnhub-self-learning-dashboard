// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock3,
  Flame,
  ListTodo,
  Pause,
  Play,
  RotateCcw,
  Search,
  Target,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  buildLearningSearchIndex,
  getLearningInsights,
  getLearningNotifications,
  searchLearningIndex,
} from "@/lib/learning-index";
import { trpc } from "@/lib/trpc";

const COLORS = {
  text: "#E8EEF7",
  dim: "#9BAABE",
  teal: "#44E0C2",
  gold: "#D6A65D",
  danger: "#F27E89",
  surface: "#111D2B",
  surface2: "#0B1522",
  border: "#294054",
};

const uid = () => `focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatDuration = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function OfflineStatus() {
  const online = useOnline();
  return (
    <span className="insightsOnlineStatus" role="status" title={online ? "الاتصال متاح والحفظ السحابي يعمل" : "أنت غير متصل؛ سيستمر الحفظ محليًا"}>
      {online ? <Wifi size={13} /> : <WifiOff size={13} />}
      <span>{online ? "متصل" : "وضع عدم الاتصال"}</span>
    </span>
  );
}

function Metric({ icon: Icon, value, label, tone = COLORS.teal }) {
  return (
    <div className="insightMetric" style={{ "--metric-tone": tone }}>
      <div className="insightMetricIcon"><Icon size={16} /></div>
      <div className="insightMetricCopy"><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

function FocusSessionCard({ data, persist, userId }) {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef("");
  const recordFocusSession = trpc.learningData.recordFocusSession.useMutation();
  const progress = Math.min(100, Math.max(0, ((minutes * 60 - seconds) / (minutes * 60)) * 100));

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setSeconds(value => {
        if (value <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          const duration = minutes * 60;
          const startedAt = startedAtRef.current || new Date(Date.now() - duration * 1000).toISOString();
          const session = { id: uid(), startedAt, endedAt: new Date().toISOString(), minutes, mode: "pomodoro", completed: true };
          persist({ ...data, meta: { ...data.meta, focusSessions: [session, ...(Array.isArray(data.meta?.focusSessions) ? data.meta.focusSessions : [])].slice(0, 180) } });
          if (userId) recordFocusSession.mutate({ id: session.id, startedAt: session.startedAt, endedAt: session.endedAt, minutes: session.minutes, mode: session.mode });
          window.dispatchEvent(new CustomEvent("app-toast", { detail: `أحسنت — أنهيت جلسة تركيز ${minutes} دقيقة` }));
          startedAtRef.current = "";
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, minutes, data, persist, userId]);

  const chooseMinutes = value => {
    if (running) return;
    setMinutes(value);
    setSeconds(value * 60);
    startedAtRef.current = "";
  };
  const reset = () => {
    setRunning(false);
    setSeconds(minutes * 60);
    startedAtRef.current = "";
  };
  const toggle = () => {
    if (!running) startedAtRef.current = startedAtRef.current || new Date().toISOString();
    setRunning(value => !value);
  };

  return (
    <section className="focusSessionCard isOpen" aria-label="جلسة التركيز">
      <div className="focusSessionHeader">
        <div className="focusSessionTitle"><span className="focusSessionIcon"><Target size={17} /></span><div><strong>جلسة تركيز سريعة</strong><small>{running ? "أنت داخل الجلسة الآن" : "اختار وقتًا وابدأ بخطوة واحدة"}</small></div></div>
        <span className="focusSessionHeaderEnd"><span className={`focusSessionState ${running ? "isRunning" : ""}`}>{running ? "جارية" : "Pomodoro"}</span></span>
      </div>
        <div className="focusSessionBody">
        <div className="focusTimerDial" style={{ "--focus-progress": `${progress}%` }}>
          <div className="focusTimerInner"><span>{running ? "تركيز" : "جاهز"}</span><strong aria-live="polite">{formatDuration(seconds)}</strong><small>{minutes} دقيقة</small></div>
        </div>
        <div className="focusSessionControls">
          <div className="focusPresetLabel">مدة الجلسة</div>
          <div className="focusPresets" role="group" aria-label="اختيار مدة جلسة التركيز">
            {[15, 25, 50].map(value => <button key={value} type="button" disabled={running} aria-pressed={minutes === value} onClick={() => chooseMinutes(value)} className={minutes === value ? "isSelected" : ""}>{value}<span>د</span></button>)}
          </div>
          <div className="focusActionRow">
            <button type="button" onClick={toggle} className="focusPrimaryAction"><span className="focusActionIcon">{running ? <Pause size={15} /> : <Play size={15} />}</span>{running ? "إيقاف مؤقت" : "ابدأ الجلسة"}</button>
            <button type="button" onClick={reset} className="focusResetAction" aria-label="إعادة ضبط الجلسة" title="إعادة ضبط"><RotateCcw size={15} /><span>إعادة</span></button>
          </div>
        </div>
        </div>
        <div className="focusSessionFooter"><span className="focusFooterDot" />تُسجّل الجلسة تلقائيًا عند اكتمالها وتظهر في إحصائياتك.</div>
    </section>
  );
}

export function InteractiveInsights({ data, persist, goto, onOpenSearch, userId }) {
  const focusQuery = trpc.learningData.focusSessions.useQuery({ limit: 180 }, { enabled: Boolean(userId), staleTime: 60_000, refetchOnWindowFocus: false });
  const metricsData = useMemo(() => {
    if (!Array.isArray(focusQuery.data) || !focusQuery.data.length) return data;
    const local = Array.isArray(data.meta?.focusSessions) ? data.meta.focusSessions : [];
    const seen = new Set(local.map(item => item.id));
    return { ...data, meta: { ...data.meta, focusSessions: [...local, ...focusQuery.data.filter(item => !seen.has(item.id))] } };
  }, [data, focusQuery.data]);
  const insights = useMemo(() => getLearningInsights(metricsData), [metricsData]);
  const notifications = useMemo(() => getLearningNotifications(data), [data]);

  return (
    <section className="interactiveInsights" aria-label="مركز التقدم التفاعلي">
      <div className="insightsHeader">
        <div className="insightsHeaderCopy"><span className="insightsEyebrow">لوحة اليوم</span><strong>مركز التحكم في رحلتك</strong><span>أهم ما يحتاج انتباهك الآن، بدون زحمة.</span></div>
        <div className="insightsHeaderActions"><OfflineStatus /><span className="insightsSummaryLabel"><BarChart3 size={13} /> ملخص الأداء</span><button type="button" onClick={onOpenSearch} className="insightsSearchButton"><Search size={14} /><span>بحث شامل</span><kbd>⌘K</kbd></button></div>
      </div>
      <div className="insightMetrics" aria-label="ملخص التقدم">
        <Metric icon={BarChart3} value={`${insights.percent}%`} label="نسبة الإنجاز" />
        <Metric icon={CheckCircle2} value={`${insights.completedTitles}/${insights.totalTitles}`} label="عناوين مكتملة" tone={COLORS.gold} />
        <Metric icon={Flame} value={insights.streak} label="أيام متتالية" tone="#F59E0B" />
        <Metric icon={Clock3} value={`${insights.focusMinutes} د`} label="تركيز مسجل" tone="#9C8AD9" />
      </div>
      <div className="insightsMainGrid">
        <FocusSessionCard data={data} persist={persist} userId={userId} />
        <section className="smartNotificationsCard isOpen" aria-label="التنبيهات الذكية">
          <div className="smartNotificationsHeader">
            <span className="smartBell"><Bell size={16} /></span><span className="smartNotificationsCopy"><strong>التنبيهات الذكية</strong><small>{notifications.length ? "خطوات صغيرة تعيدك للمسار" : "كل شيء هادئ الآن"}</small></span><span className="smartNotificationsCount">{notifications.length}</span>
          </div>
          <div className="smartNotificationsPreview"><span className="smartPreviewLine" /><span>{notifications.length ? `لديك ${notifications.length} تنبيه${notifications.length === 1 ? "" : "ات"} قابلة للتنفيذ` : "لا توجد مهام أو مراجعات متأخرة"}</span></div>
          <div className="smartNotificationsList">{notifications.slice(0, 5).map(item => <button key={item.id} type="button" onClick={() => item.target && goto(item.target)} className="smartNotificationItem"><ListTodo size={14} color={item.tone === "danger" ? COLORS.danger : item.tone === "gold" ? COLORS.gold : COLORS.teal} /><span><strong>{item.title}</strong><small>{item.body}</small></span><ArrowUpRight size={14} color={COLORS.dim} /></button>)}</div>
        </section>
      </div>
    </section>
  );
}

export function GlobalSearchModal({ data, onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const index = useMemo(() => buildLearningSearchIndex(data), [data]);
  const results = useMemo(() => searchLearningIndex(index, query), [index, query]);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="global-search-title" className="modal-backdrop" style={{ zIndex: 1400, alignItems: "flex-start", paddingTop: "9vh" }} onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <section style={{ width: "min(720px, calc(100vw - 28px))", maxHeight: "76vh", overflow: "hidden", border: `1px solid ${COLORS.teal}55`, borderRadius: 18, background: COLORS.surface, boxShadow: "0 24px 80px #000b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 14, borderBottom: `1px solid ${COLORS.border}` }}><Search size={18} color={COLORS.teal} /><input ref={inputRef} id="global-search-title" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في المجالات والعناوين والمهام والخواطر والمرفقات…" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: COLORS.text, font: "inherit" }} /><kbd style={{ color: COLORS.dim, fontSize: 10 }}>Esc</kbd><button type="button" onClick={onClose} aria-label="إغلاق البحث" style={{ border: 0, background: "transparent", color: COLORS.dim, cursor: "pointer" }}><X size={17} /></button></div>
        <div style={{ maxHeight: "60vh", overflow: "auto", padding: 10 }}>{results.length ? results.map(item => <button type="button" key={item.id} onClick={() => onNavigate(item)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, border: 0, borderBottom: `1px solid ${COLORS.border}66`, padding: "12px 9px", background: "transparent", color: COLORS.text, cursor: "pointer", textAlign: "start" }}><span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 10, background: `${COLORS.teal}16`, color: COLORS.teal, fontSize: 11, fontWeight: 900 }}>{item.kind === "title" ? "ع" : item.kind === "thought" ? "خ" : item.kind === "attachment" ? "م" : item.kind === "task" ? "م" : "خ"}</span><span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{item.title}</strong><small style={{ display: "block", color: COLORS.dim, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subtitle}</small></span><ArrowUpRight size={15} color={COLORS.dim} /></button>) : <div style={{ padding: 30, textAlign: "center", color: COLORS.dim, fontSize: 12 }}>{query ? "لا توجد نتائج مطابقة." : "ابدأ بكتابة كلمة للبحث داخل مساحتك."}</div>}</div>
        <footer style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 14px", color: COLORS.dim, fontSize: 10, borderTop: `1px solid ${COLORS.border}` }}><span>{index.length} عنصر مفهرس</span><span>Enter لفتح النتيجة · Esc للإغلاق</span></footer>
      </section>
    </div>
  );
}
