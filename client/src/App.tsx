// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { getSessionHeaders } from "@/lib/session-headers";
import { safeAssetUrl } from "@/lib/storage-url";
import { openAssetInNewTab } from "@/lib/protected-file";
import { playAlarmPreview, primeAlarmAudio, readRingingAlarms, ringAlarm, startAlarmTone, stopAlarmTone } from "@/lib/alarm-audio";
import { getDeviceNotificationStatus, notifyDevice, sendNotificationTest } from "@/lib/device-notifications";
import RichTextEditor, { RichTextDisplay, richTextToPlainText, sanitizeRichTextHTML } from "@/components/RichTextEditor";
import StudySourcesDisplay from "@/components/StudySourcesDisplay";
import StudySourcesTab from "@/components/StudySourcesTab";
import ProtectedAssetMedia from "@/components/ProtectedAssetMedia";
import InlineFilePreview from "@/components/InlineFilePreview";
import { buildAssistantContext } from "@/lib/assistant-context";
import { GlobalSearchModal, InteractiveInsights } from "@/components/InteractiveInsights";
import LearningCycle from "@/components/LearningCycle";
import { moveItem } from "@/lib/learning-index";
import { requestDeleteConfirmation } from "@/lib/delete-confirm";

const PersonalAssistant = React.lazy(() => import("@/components/PersonalAssistant"));
import {
  annualItemProgress,
  activeBattleItems,
  availableAnnualDomainsForQuarter,
  createQuarterlyPlanItems,
  dailyBattleItems,
  isPlanItemComplete,
  isReviewItem,
  linkedPlanProgress,
  quarterlyItemProgress,
  quarterlySelectionsForAnnualItem,
  removeAnnualDomainTree,
  selectPlanItemsByIds,
  sortPlanItemsByTrack,
  syncDailyCompletion,
  totalAnnualHours,
  weeklyTaskProgress,
} from "@shared/plan-utils";
import { pickNewestSnapshot } from "@shared/durable-save";
import {
  advanceStudyTimer,
  clampStudyDuration,
  formatStudyTime,
  totalStudiedSecondsForDomain,
} from "@shared/study-timer";
import {
  formatLocalCalendarDate,
  isCalendarDateReached,
  getCalendarWeekDate,
  getCalendarWeekNumber,
  getCalendarWeekStart,
  getMonthCalendarWeeks,
  getWeekTaskDate,
} from "@shared/calendar-utils";
import {
  LayoutDashboard,
  Layers,
  Briefcase,
  User,
  Users,
  GraduationCap,
  Moon,
  Bell,
  Plus,
  X,
  Trash2,
  Image as ImageIcon,
  Film,
  Link2,
  FileUp,
  Star,
  CheckCircle2,
  Clock3,
  ChevronRight,
  ChevronLeft,
  GitBranch,
  FileText,
  FolderKanban,
  Download,
  Eye,
  Save,
  Route,
  Target,
  Hourglass,
  CalendarDays,
  Pencil,
  Search,
  ExternalLink,
  Hash,
  Settings,
  Sun,
  MoonStar,
  BookOpen,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  Lock,
  NotebookPen,
  BarChart3,
  Trophy,
  Flame,
  PlayCircle,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Constants                                                              */
/* ---------------------------------------------------------------------- */
const TRACKS = [
  {
    id: "professional",
    label: "المهني",
    icon: Briefcase,
    accent: "#C98A3B",
    bg: "#2A2118",
    image: "/track-professional.png",
  },
  {
    id: "personal",
    label: "الشخصي",
    icon: User,
    accent: "#C6607A",
    bg: "#2A1C22",
    image: "/track-personal.png",
  },
  {
    id: "social",
    label: "الاجتماعي",
    icon: Users,
    accent: "#4FA697",
    bg: "#152826",
    image: "/track-social.png",
  },
  {
    id: "academic",
    label: "الأكاديمي",
    icon: GraduationCap,
    accent: "#5B8DEF",
    bg: "#161F30",
    image: "/track-academic.png",
  },
  {
    id: "spiritual",
    label: "الروحي",
    icon: Moon,
    accent: "#9C8AD9",
    bg: "#211D30",
    image: "/track-spiritual.png",
  },
  {
    id: "books",
    label: "كتبي",
    icon: BookOpen,
    accent: "#D68B5B",
    bg: "#2C211B",
    image: "/track-books.png",
  },
  {
    id: "languages",
    label: "لغتي",
    icon: BookOpen,
    accent: "#37C8B4",
    bg: "#142A2B",
    image: "/track-books.png",
  },
];

const TAB_DEFS = [
  { key: "sources", label: "المصادر", icon: BookOpen },
  { key: "explanation", label: "الشرح", icon: Search },
  { key: "summary", label: "ملخص نصي", icon: FileText },
  { key: "mindmap", label: "الخريطة الشجرية", icon: GitBranch },
  { key: "attachments", label: "المرفقات والمرئيات", icon: ImageIcon },
  { key: "project", label: "المشروع العملي", icon: FolderKanban },
  { key: "fourWords", label: "الأربع كلمات", icon: Hash },
  { key: "reverse", label: "التجربة العكسية", icon: Route },
];

const LANGUAGE_STAGE_DEFS = [
  { key: "sources", label: "المصادر", icon: BookOpen },
  { key: "grammar", label: "الجرامر", icon: FileText },
  { key: "listening", label: "الاستماع", icon: Volume2 },
  { key: "reading", label: "القراءة", icon: BookOpen },
  { key: "speaking", label: "التحدث", icon: Mic },
  { key: "writing", label: "الكتابة", icon: NotebookPen },
];

const REVIEW_STAGES = [
  { days: 1, label: "المراجعة الأولى", hint: "بعد يوم واحد" },
  { days: 3, label: "المراجعة الثانية", hint: "بعد ٣ أيام" },
  { days: 7, label: "المراجعة الثالثة", hint: "بعد أسبوع" },
  { days: 14, label: "المراجعة الرابعة", hint: "بعد أسبوعين" },
  { days: 30, label: "المراجعة الخامسة", hint: "بعد شهر" },
];

const STORAGE_KEY = "self-learning-app-data";
const STORAGE_REPLICA_KEYS = [
  "self-learning-app-data-backup",
  "self-learning-app-data-backup-2",
  "self-learning-app-data-backup-3",
];
const DURABLE_DB_NAME = "self-learning-durable-storage";
const DURABLE_STORE_NAME = "snapshots";
const DURABLE_SNAPSHOT_KEY = "latest";
const CLOUD_PENDING_KEY = "self-learning-cloud-pending-v1";
const DAILY_BACKUP_KEY = "self-learning-daily-backup-v1";
const PIN_STORAGE_KEY = "self-learning-data-pin-v1";
const accountKeySuffix = userId => {
  const numericId = Number(userId);
  return Number.isSafeInteger(numericId) && numericId > 0 ? `-user-${numericId}` : "";
};
const scopedStorageKey = (key, userId) => `${key}${accountKeySuffix(userId)}`;
const snapshotStorageKeys = userId =>
  [STORAGE_KEY, ...STORAGE_REPLICA_KEYS].map(key => scopedStorageKey(key, userId));
const cloudPendingStorageKey = userId => scopedStorageKey(CLOUD_PENDING_KEY, userId);
const dailyBackupStorageKey = userId => scopedStorageKey(DAILY_BACKUP_KEY, userId);
const profileImageStorageKey = userId => scopedStorageKey("self-learning-profile-image", userId);
const guestImportDecisionStorageKey = userId => `self-learning-guest-import-v1-user-${Number(userId)}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const safeStorageGet = (key, fallback = null) => {
  try {
    return typeof window === "undefined"
      ? fallback
      : (window.localStorage.getItem(key) ?? fallback);
  } catch {
    return fallback;
  }
};
const safeStorageSet = (key, value) => {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch {
    // IndexedDB remains available as the durable local fallback.
  }
  return false;
};
const safeStorageRemove = key => {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch {
    // Ignore cleanup failures; a later successful save can retry cleanup.
  }
};
const hashPin = async pin => {
  const bytes = new TextEncoder().encode(String(pin));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
};
const verifyStoredPin = async (message = "أدخل PIN لتأكيد العملية") => {
  const storedHash = safeStorageGet(PIN_STORAGE_KEY, "");
  if (!storedHash) {
    notifyApp("فعّل قفل PIN أولًا من الإعدادات لحماية الحذف والاسترجاع");
    return false;
  }
  const entered = window.prompt(message);
  if (!entered || !/^\d{4,6}$/.test(entered)) {
    notifyApp("أدخل PIN صحيحًا من 4 إلى 6 أرقام");
    return false;
  }
  const matches = (await hashPin(entered)) === storedHash;
  if (!matches) notifyApp("PIN غير صحيح — لم يتم تنفيذ العملية");
  return matches;
};
const hasLearningContent = value =>
  Boolean(
    value &&
      (value.domains?.length ||
        Object.values(value.meta?.planItems || {}).some(items => items?.length) ||
        value.meta?.habits?.length ||
        Object.values(value.meta?.aboutMe || {}).some(Boolean) ||
        value.meta?.vision ||
        value.meta?.masterPlan ||
        value.meta?.stageGoal)
  );
const safeJsonParse = (raw, fallback = {}) => {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return fallback;
  }
};
const readBestLocalSnapshot = (userId = null) => {
  const candidates = snapshotStorageKeys(userId)
    .map((key, order) => ({
      order,
      value: safeJsonParse(safeStorageGet(key, "{}"), null),
    }))
    .filter(item => hasLearningContent(item.value));
  candidates.sort((left, right) => {
    const revisionDiff =
      Number(right.value?.meta?.localRevision || 0) -
      Number(left.value?.meta?.localRevision || 0);
    return revisionDiff || left.order - right.order;
  });
  return candidates[0]?.value || {};
};
const openDurableStorage = () =>
  new Promise(resolve => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(DURABLE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DURABLE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
const readDurableSnapshot = async (userId = null) => {
  const db = await openDurableStorage();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db
        .transaction(DURABLE_STORE_NAME, "readonly")
        .objectStore(DURABLE_STORE_NAME)
        .get(scopedStorageKey(DURABLE_SNAPSHOT_KEY, userId));
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
};
const writeDurableSnapshot = async (snapshot, userId = null) => {
  const db = await openDurableStorage();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const transaction = db.transaction(DURABLE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(DURABLE_STORE_NAME);
      const snapshotKey = scopedStorageKey(DURABLE_SNAPSHOT_KEY, userId);
      const request = store.get(snapshotKey);
      request.onsuccess = () => {
        const storedRevision = Number(request.result?.meta?.localRevision || 0);
        const incomingRevision = Number(snapshot?.meta?.localRevision || 0);
        if (storedRevision <= incomingRevision) {
          store.put(snapshot, snapshotKey);
        }
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };
      transaction.onerror = () => {
        db.close();
        resolve(false);
      };
      transaction.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
};
const writeDurableBackup = async (key, snapshot, userId = null) => {
  const db = await openDurableStorage();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const transaction = db.transaction(DURABLE_STORE_NAME, "readwrite");
      transaction.objectStore(DURABLE_STORE_NAME).put(snapshot, scopedStorageKey(key, userId));
      transaction.oncomplete = () => { db.close(); resolve(true); };
      transaction.onerror = () => { db.close(); resolve(false); };
      transaction.onabort = () => { db.close(); resolve(false); };
    } catch {
      db.close();
      resolve(false);
    }
  });
};
const requestDurableStorage = async () => {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Persistence is a browser capability; ordinary storage still works.
  }
};
const persistLocalSnapshot = (snapshot, userId = null) => {
  const serialized = JSON.stringify(snapshot);
  const localSaved = snapshotStorageKeys(userId)
    .map(key => safeStorageSet(key, serialized))
    .some(Boolean);
  return writeDurableSnapshot(snapshot, userId).then(durableSaved => {
    if (!localSaved && !durableSaved) {
      console.error("[Persistence] Browser storage rejected the latest snapshot");
      notifyApp("تعذر حفظ التعديل على هذا الجهاز؛ نزّل نسخة احتياطية الآن قبل متابعة العمل.");
      return false;
    }
    return true;
  });
};
const notifyApp = (detail = "تمت الإضافة بنجاح") => {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("app-toast", { detail }));
};
const PLAN_LEVELS = [
  { key: "annual", label: "الخطة السنوية", color: "#8B7CFF" },
  { key: "quarterly", label: "الخطة الربع سنوية", color: "#5B8DEF" },
  { key: "monthly", label: "الخطة الشهرية", color: "#31C7B1" },
  { key: "weekly", label: "الخطة الأسبوعية", color: "#E8C468" },
  { key: "daily", label: "الخطة اليومية", color: "#E0719A" },
];
const DEFAULT_PLAN_ITEMS = {
  annual: [],
  quarterly: [],
  monthly: [],
  weekly: [],
  daily: [],
};

/* ⏳ آخر يوم في الخطة — غيّر هذا التاريخ والوقت ليعكس نهاية خطتك الفعلية.
   الصيغة: "YYYY-MM-DDTHH:mm:ss" بتوقيتك المحلي.                         */
const PLAN_END_DATE = "2026-12-31T23:59:59";
const DEFAULT_DEADLINES = [];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let inAppDeleteRequest = null;
const confirmDelete = (label = "هذا العنصر", action = () => {}) => {
  if (inAppDeleteRequest) return inAppDeleteRequest(label, action);
  action();
  return true;
};

const todayISO = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const DAILY_SUCCESS_QUOTES = [
  {
    quote: "في وسط الصعوبة تكمن الفرصة.",
    author: "ألبرت أينشتاين",
    note: "مقولة منسوبة إليه",
  },
  {
    quote: "لا تحتاج إلى أن تكون عبقريًا لتبدأ، لكن عليك أن تبدأ كي تتعلم.",
    author: "إيلون ماسك",
    note: "صياغة عربية مستوحاة من تصريحاته عن التعلّم والعمل",
  },
  {
    quote: "الطريقة الوحيدة لإنجاز عمل عظيم هي أن تحب ما تفعله.",
    author: "ستيف جوبز",
    note: "مقولة منسوبة إليه",
  },
  {
    quote: "لا يهم مدى بطء سيرك ما دمت لا تتوقف.",
    author: "كونفوشيوس",
    note: "مقولة منسوبة إليه",
  },
  {
    quote: "كل إنجاز عظيم بدأ بقرار المحاولة.",
    author: "أوبرا وينفري",
    note: "حكمة مستوحاة من حديثها عن النجاح",
  },
  {
    quote: "النجاح ليس نهائيًا، والفشل ليس قاتلًا؛ الشجاعة في الاستمرار هي ما يصنع الفرق.",
    author: "وينستون تشرشل",
    note: "مقولة شائعة منسوبة إليه",
  },
  {
    quote: "ما يبدو مستحيلًا اليوم قد يصبح إنجازك القادم إذا واصلت التقدم.",
    author: "نيلسون مانديلا",
    note: "حكمة مستوحاة من كلماته عن المثابرة",
  },
  {
    quote: "الفرص لا تأتي وحدها؛ أنت تصنعها بالعمل والاستعداد.",
    author: "توماس إديسون",
    note: "مقولة منسوبة إليه",
  },
];

const getDailySuccessQuote = (date = todayISO()) => {
  const dayNumber = date.split("-").reduce((total, part) => total + Number(part), 0);
  return DAILY_SUCCESS_QUOTES[dayNumber % DAILY_SUCCESS_QUOTES.length];
};

function DailySuccessQuote() {
  const quote = getDailySuccessQuote();
  const dateLabel = new Date(`${todayISO()}T12:00:00`).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <section
      className="dailySuccessQuote"
      aria-label="حكمة النجاح اليومية"
      style={{
        position: "relative",
        overflow: "hidden",
        marginTop: 18,
        padding: "19px 21px",
        border: `1px solid ${COLORS.gold}55`,
        borderRadius: 20,
        background: `linear-gradient(135deg, ${COLORS.gold}18, ${COLORS.violet}12 58%, ${COLORS.surface})`,
        boxShadow: "0 15px 35px rgba(3, 10, 24, .16)",
      }}
    >
      <div style={{ position: "absolute", width: 170, height: 170, borderRadius: "50%", insetInlineEnd: -70, top: -85, background: `${COLORS.gold}12`, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 13 }}>
        <div style={{ flex: "0 0 auto", width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 13, color: COLORS.gold, background: `${COLORS.gold}20`, border: `1px solid ${COLORS.gold}45` }}>
          <Star size={20} fill="currentColor" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: COLORS.gold, fontSize: 12 }}>حكمة النجاح اليومية</strong>
            <span style={{ color: COLORS.textDim, fontSize: 10 }}>{dateLabel}</span>
          </div>
          <blockquote style={{ margin: "11px 0 8px", color: COLORS.text, fontSize: 16, fontWeight: 800, lineHeight: 1.8 }}>
            «{quote.quote}»
          </blockquote>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ color: COLORS.teal, fontSize: 11, fontWeight: 800 }}>— {quote.author}</span>
            <span style={{ color: COLORS.textDim, fontSize: 9 }}>({quote.note})</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const getConfiguredAlarms = meta => {
  if (Array.isArray(meta?.alarms)) {
    return meta.alarms.map((alarm, index) => ({
      ...alarm,
      id: String(alarm?.id || `alarm-${index + 1}`),
    }));
  }
  // Preserve the settings from the earlier single-alarm format.
  return meta?.alarm && typeof meta.alarm === "object"
    ? [{ id: "legacy-alarm", ...meta.alarm }]
    : [];
};

const playReviewTone = () => {
  primeAlarmAudio();
  playAlarmPreview("loud");
};

const addDays = (isoDate, days) => {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const diffDaysFromToday = isoDate => {
  const [year, month, day] = String(isoDate || "")
    .split("-")
    .map(Number);
  if (!year || !month || !day) return 0;
  const due = new Date(year, month - 1, day);
  const [todayYear, todayMonth, todayDay] = todayISO().split("-").map(Number);
  const today = new Date(todayYear, todayMonth - 1, todayDay);
  return Math.round((today - due) / 86400000);
};

const formatArabicDate = isoDate => {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const emptyTabs = () => ({
  explanation: { url: "", notes: "" },
  summary: "",
  mindmap: { nodes: [{ id: "root", parentId: null, text: "" }] },
  attachments: [],
  video: { url: "", notes: "", files: [] },
  project: { description: "", links: [], files: [] },
  fourWords: { words: ["", "", "", ""], image: null },
  reverse: { text: "", audio: "", video: null, files: [] },
  languageStages: {},
});

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

const emptySubtopic = title => ({
  id: uid(),
  title,
  branchId: null,
  dateStarted: null,
  tabs: emptyTabs(),
  reviewDone: Array(REVIEW_STAGES.length).fill(false),
  learning: emptyLearning(title),
});

const getScheduledTitleLink = (data, task) => {
  if (!task?.domainId || !task?.subtopicId) return null;
  const domain = data.domains.find(item => item.id === task.domainId);
  const subtopic = domain?.subtopics.find(item => item.id === task.subtopicId);
  return domain && subtopic ? { domain, subtopic } : null;
};

const resolveScheduledTask = (data, task) => {
  const link = getScheduledTitleLink(data, task);
  return link
    ? {
        ...task,
        title: link.subtopic.title,
        titleHtml: link.subtopic.titleHtml || task.titleHtml || null,
        domain: link.domain.name,
        track: link.domain.track,
        completed: Boolean(link.subtopic.completed ?? task.completed),
        sources: link.subtopic.sources || task.sources || null,
      }
    : task;
};

const updateScheduledTask = (data, taskId, completed) => {
  const task = (data.meta.weekTasks || []).find(item => item.id === taskId);
  const link = getScheduledTitleLink(data, task);
  return {
    ...data,
    domains: link
      ? data.domains.map(domain =>
          domain.id !== link.domain.id
            ? domain
            : {
                ...domain,
                subtopics: domain.subtopics.map(subtopic =>
                  subtopic.id === link.subtopic.id
                    ? {
                        ...subtopic,
                        completed,
                        dateStarted: completed
                          ? subtopic.dateStarted || todayISO()
                          : subtopic.dateStarted,
                        reviewDone: completed
                          ? Array(REVIEW_STAGES.length).fill(false)
                          : subtopic.reviewDone,
                      }
                    : subtopic
                ),
              }
        )
      : data.domains,
    meta: {
      ...data.meta,
      weekTasks: (data.meta.weekTasks || []).map(item =>
        item.id === taskId ? { ...item, completed } : item
      ),
    },
  };
};

const removeScheduledTask = (data, taskId) => {
  const task = (data.meta.weekTasks || []).find(item => item.id === taskId);
  const link = getScheduledTitleLink(data, task);
  return {
    ...data,
    domains: link
      ? data.domains.map(domain =>
          domain.id !== link.domain.id
            ? domain
            : {
                ...domain,
                subtopics: domain.subtopics.filter(
                  subtopic => subtopic.id !== link.subtopic.id
                ),
              }
        )
      : data.domains,
    meta: {
      ...data.meta,
      weekTasks: (data.meta.weekTasks || []).filter(item => item.id !== taskId),
    },
  };
};

const openScheduledTitle = (data, task, goto) => {
  const link = getScheduledTitleLink(data, task);
  if (!link) return;
  goto({
    screen: "lesson",
    domainId: link.domain.id,
    subtopicId: link.subtopic.id,
    track: link.domain.track,
  });
};

const tabHasContent = (subtopic, key) => {
  if (key === "sources") {
    const sources = subtopic.sources || {};
    return Boolean(
      (Array.isArray(sources.names) && sources.names.some(name => typeof name === "string" && name.trim())) ||
        (Array.isArray(sources.files) && sources.files.length > 0)
    );
  }
  const t =
    subtopic.tabs?.[key] ||
    (key === "explanation"
      ? { url: "", notes: "" }
      : key === "mindmap"
        ? { nodes: [] }
        : key === "flashcards"
          ? []
          : key === "video"
          ? { url: "", notes: "", files: [] }
          : key === "project"
            ? { description: "", links: [], files: [] }
            : []);
  const hasText = value => typeof value === "string" && value.trim().length > 0;
  if (key === "explanation")
    return Boolean(
      t && typeof t === "object" && (hasText(t.url) || hasText(t.notes))
    );
  if (key === "summary") return hasText(t);
  if (key === "mindmap")
    return Boolean(
      t &&
        Array.isArray(t.nodes) &&
        t.nodes.some(n => n && n.parentId !== null && hasText(n.text))
    );
  if (key === "attachments") return Array.isArray(t) && t.length > 0;
  if (key === "flashcards") return Array.isArray(t) && t.length > 0;
  if (key === "video")
    return Boolean(
      t &&
        typeof t === "object" &&
        (hasText(t.url) ||
          hasText(t.notes) ||
          (Array.isArray(t.files) && t.files.length > 0))
    );
  if (key === "project")
    return Boolean(
      t &&
        typeof t === "object" &&
        (hasText(t.description) ||
          (Array.isArray(t.links) && t.links.length > 0) ||
          (Array.isArray(t.files) && t.files.length > 0))
    );
  if (key === "fourWords") {
    const words = Array.isArray(t) ? t : t?.words;
    return (
      (Array.isArray(words) && words.some(hasText)) ||
      Boolean(t?.image?.dataUrl)
    );
  }
  if (key === "reverse")
    return typeof t === "string"
      ? hasText(t)
      : Boolean(
          t &&
            typeof t === "object" &&
            (hasText(t.text) ||
              hasText(t.audio) ||
              t.video?.dataUrl ||
              (Array.isArray(t.files) && t.files.length > 0))
        );
  if (LANGUAGE_STAGE_DEFS.some(stage => stage.key === key))
    return Boolean(t && typeof t === "object" && (t.completed || hasText(t.text) || (Array.isArray(t.files) && t.files.length > 0)));
  return false;
};

const starsFor = subtopic =>
  TAB_DEFS.filter(t => tabHasContent(subtopic, t.key)).length;

const isTitleTaskComplete = (data, domain, sub) => {
  const title = String(sub.title || "").trim().toLowerCase();
  const domainName = String(domain.name || "").trim().toLowerCase();
  const dailyComplete = (data.meta.planItems?.daily || []).some(item =>
    String(item.domain || "").trim().toLowerCase() === domainName &&
    String(item.title || "").trim().toLowerCase() === title &&
    isPlanItemComplete(item)
  );
  const weeklyComplete = (data.meta.weekTasks || []).some(task =>
    task.subtopicId === sub.id && isPlanItemComplete(task)
  );
  return Boolean(sub.completed) || dailyComplete || weeklyComplete;
};

const progressStats = data => {
  const tasks = [];
  (data.domains || []).forEach(domain => {
    (domain.subtopics || []).forEach(sub => {
      if (!isTitleTaskComplete(data, domain, sub)) return;
      const reviewStart = sub.dateStarted || todayISO();
      REVIEW_STAGES.forEach((stage, index) =>
        tasks.push({
          domain,
          sub,
          stage,
          index,
          reviewStart,
          done: Boolean(sub.reviewDone?.[index]),
        })
      );
    });
  });
  const completed = tasks.filter(task => task.done).length;
  return {
    tasks,
    total: tasks.length,
    completed,
    percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
};

const normalizeDailyPlan = (dailyPlan = {}) => {
  if (Array.isArray(dailyPlan)) return dailyPlan;
  return Object.entries(dailyPlan)
    .filter(([, title]) => typeof title === "string" && title.trim())
    .map(([trackId, title]) => ({ id: uid(), trackId, domainId: null, title }));
};

const normalizePlanItems = planItems =>
  PLAN_LEVELS.reduce((result, level) => {
    const items = planItems?.[level.key];
    result[level.key] = Array.isArray(items)
      ? items
          .filter(item => item && typeof item === "object")
          .filter(
            item =>
              !["annual", "quarterly"].includes(level.key) ||
              Boolean(item.track)
          )
          .map(item => ({
            ...item,
            id: String(item.id || uid()),
            domain: String(item.domain || ""),
            title: String(item.title || ""),
            progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
          }))
      : DEFAULT_PLAN_ITEMS[level.key].map(item => ({ ...item }));
    return result;
  }, {});

const normalizeAppData = (parsed = {}) => ({
  domains: Array.isArray(parsed?.domains)
    ? parsed.domains
        .filter(domain => domain && typeof domain === "object")
        .map(domain => ({
          ...domain,
          id: String(domain.id || uid()),
          name: String(domain.name || ""),
          branches: Array.isArray(domain.branches)
            ? domain.branches
                .filter(branch => branch && typeof branch === "object")
                .map(branch => ({
                  ...branch,
                  id: String(branch.id || uid()),
                  name: String(branch.name || "").trim(),
                }))
                .filter(branch => branch.name)
            : [],
          subtopics: Array.isArray(domain.subtopics)
            ? domain.subtopics
                .filter(subtopic => subtopic && typeof subtopic === "object")
                .map(subtopic => ({
                  ...subtopic,
                  id: String(subtopic.id || uid()),
                  title: String(subtopic.title || ""),
                  branchId: subtopic.branchId ? String(subtopic.branchId) : null,
                  tabs: { ...emptyTabs(), ...(subtopic.tabs || {}) },
                  reviewDone: Array.isArray(subtopic.reviewDone)
                    ? subtopic.reviewDone
                        .map(Boolean)
                        .slice(0, REVIEW_STAGES.length)
                        .concat(
                          Array(
                            Math.max(
                              0,
                              REVIEW_STAGES.length - subtopic.reviewDone.length
                            )
                          ).fill(false)
                        )
                    : Array(REVIEW_STAGES.length).fill(false),
                  learning: {
                    ...emptyLearning(String(subtopic.title || "العنوان")),
                    ...(subtopic.learning && typeof subtopic.learning === "object" ? subtopic.learning : {}),
                    stageDone: { ...(subtopic.learning?.stageDone || {}) },
                    mistakes: Array.isArray(subtopic.learning?.mistakes) ? subtopic.learning.mistakes : [],
                    reviews: Array.isArray(subtopic.learning?.reviews) ? subtopic.learning.reviews : [],
                  },
                  detailsUnderstood: Boolean(subtopic.detailsUnderstood),
                }))
            : [],
        }))
    : [],
  meta: {
    vision: "",
    masterPlan: "",
    stageGoal: "",
    dailyPlan: {},
    progressHistory: [],
    ...(parsed?.meta || {}),
    aiTools: Array.isArray(parsed?.meta?.aiTools)
      ? parsed.meta.aiTools
          .filter(tool => tool && typeof tool === "object")
          .map(tool => ({
            id: String(tool.id || uid()),
            name: String(tool.name || "").trim(),
            url: String(tool.url || "").trim(),
            category: String(tool.category || "other"),
            createdAt: String(tool.createdAt || todayISO()),
          }))
          .filter(tool => tool.name && tool.url)
      : [],
    habits: Array.isArray(parsed?.meta?.habits)
      ? parsed.meta.habits
          .filter(habit => habit && typeof habit === "object")
          .map(habit => ({
            id: String(habit.id || uid()),
            name: String(habit.name || "").trim(),
            createdAt: String(habit.createdAt || todayISO()),
          }))
          .filter(habit => habit.name)
      : [],
    habitCompletions:
      parsed?.meta?.habitCompletions &&
      typeof parsed.meta.habitCompletions === "object"
        ? parsed.meta.habitCompletions
        : {},
    aboutMe: {
      identity: "",
      strengths: "",
      growthAreas: "",
      learningStyle: "",
      ...(parsed?.meta?.aboutMe || {}),
    },
    planItems: normalizePlanItems(parsed?.meta?.planItems),
    deadlines: Array.isArray(parsed?.meta?.deadlines)
      ? parsed.meta.deadlines.filter(item => item.id !== "plan-end")
      : DEFAULT_DEADLINES,
  },
});

const weekKey = (date = new Date()) => {
  return formatLocalCalendarDate(getCalendarWeekStart(date));
};

const fileToDataUrl = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      onProgress?.(100);
      resolve(r.result);
    };
    r.onerror = () => reject(new Error("read failed"));
    r.onprogress = event => {
      if (event.lengthComputable)
        onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    r.readAsDataURL(file);
  });

async function uploadFileDirect(file, onProgress) {
  const startResponse = await fetch("/api/storage/upload/start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getSessionHeaders() },
    body: JSON.stringify({
      fileName: file.name || "learning-upload",
      contentType: file.type || "application/octet-stream",
      size: Number(file.size) || 0,
    }),
  });
  const startPayload = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok) {
    throw new Error(startPayload?.message || `تعذر بدء الرفع (${startResponse.status}).`);
  }

  const { uploadId, chunkSize, partCount } = startPayload || {};
  if (
    typeof uploadId !== "string" ||
    !Number.isSafeInteger(chunkSize) || chunkSize <= 0 ||
    !Number.isSafeInteger(partCount) || partCount < 0
  ) {
    throw new Error("لم يصل إعداد موثوق لتقسيم الملف؛ لم يُحفظ الملف.");
  }

  let completedBytes = 0;
  for (let index = 0; index < partCount; index += 1) {
    const offset = index * chunkSize;
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/storage/upload/part");
          xhr.withCredentials = true;
          xhr.timeout = 10 * 60 * 1000;
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.setRequestHeader("X-Upload-Id", uploadId);
          xhr.setRequestHeader("X-Part-Index", String(index));
          const sessionHeader = getSessionHeaders()["X-Webdev-Session"];
          if (sessionHeader) xhr.setRequestHeader("X-Webdev-Session", sessionHeader);
          xhr.upload.onprogress = event => {
            if (event.lengthComputable && file.size > 0) {
              onProgress?.(Math.min(99, Math.round(((completedBytes + event.loaded) / file.size) * 100)));
            }
          };
          xhr.onload = () => {
            const payload = (() => {
              try { return JSON.parse(xhr.responseText || "{}"); } catch { return {}; }
            })();
            if (xhr.status >= 200 && xhr.status < 300 && payload?.uploaded) {
              resolve(payload);
              return;
            }
            const error = new Error(payload?.message || `تعذر رفع الجزء ${index + 1} (${xhr.status}).`);
            error.status = xhr.status;
            reject(error);
          };
          xhr.onerror = () => {
            const error = new Error("انقطع الاتصال أثناء رفع جزء من الملف.");
            error.status = 0;
            reject(error);
          };
          xhr.ontimeout = () => {
            const error = new Error("انتهت مهلة رفع جزء من الملف.");
            error.status = 0;
            reject(error);
          };
          xhr.onabort = () => reject(new Error("أُوقف الرفع قبل اكتماله؛ لم يُضف الملف إلى بياناتك."));
          xhr.send(chunk);
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status) || 0;
        const permanentClientError = status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (permanentClientError || attempt === 2) break;
        onProgress?.(file.size > 0 ? Math.round((completedBytes / file.size) * 100) : 0);
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (lastError) {
      throw new Error(`${lastError.message || "تعذر رفع جزء من الملف"} لم تتم إضافة الملف إلى بياناتك؛ أعد المحاولة.`);
    }
    completedBytes += chunk.size;
    onProgress?.(file.size > 0 ? Math.min(99, Math.round((completedBytes / file.size) * 100)) : 0);
  }

  const completeResponse = await fetch("/api/storage/upload/complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getSessionHeaders() },
    body: JSON.stringify({ uploadId }),
  });
  const completed = await completeResponse.json().catch(() => ({}));
  if (!completeResponse.ok || !completed?.url || !completed?.key) {
    throw new Error(completed?.message || "لم يكتمل تأكيد الملف؛ لم تتم إضافته إلى بياناتك.");
  }
  onProgress?.(100);
  return completed;
}

/* ---------------------------------------------------------------------- */
/* Root component                                                         */
/* ---------------------------------------------------------------------- */

function SignInRequiredScreen({ authError, toast }) {
  return (
    <div style={styles.appShell} className="app-shell dark-mode" dir="rtl">
      <style>{globalCss}</style>
      <div style={styles.glowBlobTeal} className="glow-blob" />
      <div style={styles.glowBlobViolet} className="glow-blob" />
      <main
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          position: "relative",
          zIndex: 1,
        }}
      >
        <section
          aria-labelledby="signin-title"
          style={{
            width: "100%",
            maxWidth: 410,
            textAlign: "center",
            padding: "28px 22px",
            borderRadius: 22,
            border: `1px solid ${COLORS.border}`,
            background: `linear-gradient(150deg, ${COLORS.surface}, ${COLORS.surface2})`,
            boxShadow: "0 24px 64px rgba(0,0,0,.28)",
          }}
        >
          <div
            style={{
              ...styles.settingsIcon,
              width: 58,
              height: 58,
              margin: "0 auto 17px",
              borderRadius: 18,
            }}
          >
            <BookOpen size={27} />
          </div>
          <div style={{ color: COLORS.teal, fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>
            LEARNHUB
          </div>
          <h1
            id="signin-title"
            style={{
              color: COLORS.text,
              fontFamily: FONT_HEAD,
              fontSize: 23,
              lineHeight: 1.4,
              margin: "9px 0 8px",
            }}
          >
            سجّل دخولك للمتابعة
          </h1>
          <p style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.8, margin: "0 0 18px" }}>
            سجّل باستخدام حساب Google / Gmail الذي تريد ربطه بـ LearnHub. سيظهر البريد المختار داخل الإعدادات، وتُحفظ بيانات كل حساب بشكل منفصل.
          </p>
          {authError && (
            <div role="alert" style={{ color: COLORS.gold, fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
              تعذّر التحقق من جلسة الدخول. سجّل الدخول مجددًا للمتابعة.
            </div>
          )}
          {toast && (
            <div role="alert" style={{ color: COLORS.gold, fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
              {toast}
            </div>
          )}
          <button
            type="button"
            onClick={() => void startLogin()}
            style={{
              ...styles.primaryBtn,
              width: "100%",
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              background: COLORS.teal,
              color: "#071311",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            <Lock size={17} />
            اختيار حساب Google / Gmail
          </button>
          <p style={{ color: COLORS.textDim, fontSize: 10, lineHeight: 1.7, margin: "16px 0 0" }}>
            إذا كانت لديك بيانات ضيف قديمة على هذا الجهاز، ستتمكن من اختيار نقلها إلى حسابك بعد الدخول؛ لن تُدمج تلقائيًا.
          </p>
        </section>
      </main>
    </div>
  );
}

function MiddayHabitCheck({ data, persist, onClose }) {
  const today = todayISO();
  const habits = Array.isArray(data?.meta?.habits) ? data.meta.habits : [];
  const todayCompletions = data.meta.habitCompletions?.[today] || {};
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState(todayCompletions);
  const current = habits[currentIndex];
  const finish = nextAnswers => {
    persist({ ...data, meta: { ...data.meta, habitCompletions: { ...(data.meta.habitCompletions || {}), [today]: nextAnswers }, middayHabitCheck: { date: today, completedAt: new Date().toISOString() } } });
    onClose();
  };
  const answer = value => {
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    if (currentIndex >= habits.length - 1) finish(next);
    else setCurrentIndex(index => index + 1);
  };
  if (!habits.length) return <div className="middayHabitCard"><div className="middayHabitEyebrow"><Sun size={14} /> وقفة منتصف اليوم</div><h2>كيف ماشي يومك؟</h2><p>أضف عاداتك أولًا، وبعدها هسألك عنها هنا بلطف وفي وقت مناسب.</p><button type="button" onClick={onClose} style={{ ...styles.primaryBtn, background: COLORS.teal, color: "#071311" }}>تمام، أكمل يومي</button></div>;
  return <div className="middayHabitCard"><div className="middayHabitEyebrow"><Sun size={14} /> وقفة منتصف اليوم · {currentIndex + 1} من {habits.length}</div><h2>خلينا نطمن على يومك</h2><p>هل أنجزت عادة <strong>{current.name}</strong> حتى الآن؟ مفيش ضغط — المهم نعرف وضعك ونختار الخطوة التالية.</p><div className="middayHabitActions"><button type="button" onClick={() => answer(true)}><CheckCircle2 size={17} /> أيوه، أنجزتها</button><button type="button" onClick={() => answer(false)}><Clock3 size={17} /> لسه، أرجع لها لاحقًا</button><button type="button" onClick={() => answer(null)}><X size={17} /> أؤجلها لليوم</button></div><button type="button" className="middayDismiss" onClick={onClose}>اسألني بعدين</button></div>;
}

export default function App() {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const storageScopeKey = userId ? `user-${userId}` : "guest";
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const trpcUtils = trpc.useUtils();
  const [loadedScope, setLoadedScope] = useState(null);
  const [cloudReadyUserId, setCloudReadyUserId] = useState(null);
  const localLoaded = (Boolean(userId) || auth.isGuest) && !auth.loading && loadedScope === storageScopeKey;
  const loaded = auth.isGuest
    ? localLoaded
    : Boolean(userId) && localLoaded && cloudReadyUserId === userId;
  const remoteLearningQuery = trpc.learningData.get.useQuery(
    { userId: userId ?? 0 },
    {
    enabled: Boolean(userId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    },
  );
  const uploadAsset = useCallback(async (file, onProgress) => {
    if (!file) return null;
    if (auth.isGuest) {
      const jobId = uid();
      const fileName = file.name || "ملف";
      const reportLocalProgress = value => {
        const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        setUploadJobs(current => current.map(job => job.id === jobId ? { ...job, progress } : job));
        onProgress?.(progress);
      };
      setUploadJobs(current => [...current, { id: jobId, name: fileName, progress: 0 }]);
      const localUrl = await fileToDataUrl(file, reportLocalProgress);
      window.setTimeout(() => setUploadJobs(current => current.filter(job => job.id !== jobId)), 700);
      notifyApp("تم تجهيز الملف محليًا للمعاينة؛ سجّل الدخول لحفظه سحابيًا.");
      return { uploaded: true, key: `local-${uid()}`, url: String(localUrl), dataUrl: String(localUrl), fileName, mime: file.type || "application/octet-stream", size: file.size };
    }
    if (!auth.user) {
      notifyApp("سجّل الدخول أولًا لحفظ الملفات سحابيًا وفتحها من أي جهاز.");
      return null;
    }
    const uploadUserId = auth.user.id;
    const jobId = uid();
    setUploadJobs(current => [...current, { id: jobId, name: file.name || "ملف", progress: 0 }]);
    const reportProgress = value => {
      const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
      setUploadJobs(current => current.map(job => job.id === jobId ? { ...job, progress } : job));
      onProgress?.(progress);
    };
    try {
      reportProgress(0);
      const stored = await uploadFileDirect(file, reportProgress);
      if (uploadUserId !== activeUserIdRef.current) return null;
      reportProgress(100);
      notifyApp("تم رفع الملف وحفظه سحابيًا.");
      return stored;
    } catch (error) {
      notifyApp(
        error instanceof Error && error.message
          ? error.message
          : "تعذر رفع الملف. تحقق من الاتصال أو من الحدود التي تفرضها منصة التخزين، ثم حاول مرة أخرى."
      );
      return null;
    } finally {
      setUploadJobs(current => current.filter(job => job.id !== jobId));
    }
  }, [auth.user]);
  const cloudSaveMutation = trpc.learningData.save.useMutation({
    onError: () => {
      const now = Date.now();
      if (typeof window !== "undefined" && now - cloudSaveErrorShownAtRef.current > 10000) {
        cloudSaveErrorShownAtRef.current = now;
        window.dispatchEvent(
          new CustomEvent("app-toast", {
            detail: "تعذر حفظ آخر تعديل سحابيًا. تحقق من الاتصال ثم حاول مرة أخرى؛ سيظل آخر إصدار محليًا مؤقتًا.",
          })
        );
      }
    },
  });
  const [data, setData] = useState(null); // { domains: [] }
  const [nav, setNav] = useState({
    screen: "dashboard",
    track: null,
    domainId: null,
    subtopicId: null,
  });
  const navHistory = useRef([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [dailyPlanOpen, setDailyPlanOpen] = useState(false);
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [deadlineAlert, setDeadlineAlert] = useState(null);
  const [ringingAlarms, setRingingAlarms] = useState(() => readRingingAlarms());
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [toast, setToast] = useState("");
  const [uploadJobs, setUploadJobs] = useState<Array<{ id: string; name: string; progress: number }>>([]);
  const [welcomeReminderOpen, setWelcomeReminderOpen] = useState(false);
  const [middayHabitCheckOpen, setMiddayHabitCheckOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [inlinePreview, setInlinePreview] = useState(null);
  const [settings, setSettings] = useState({ language: "ar", theme: "dark" });
  const [dailyBackupTick, setDailyBackupTick] = useState(0);
  const [profileImage, setProfileImage] = useState("");
  useEffect(() => {
    const handlePreview = event => setInlinePreview(event.detail || null);
    window.addEventListener("learnhub:preview-file", handlePreview);
    const handleDelete = event => setDeleteRequest(event.detail || null);
    window.addEventListener("learnhub:confirm-delete", handleDelete);
    return () => {
      window.removeEventListener("learnhub:preview-file", handlePreview);
      window.removeEventListener("learnhub:confirm-delete", handleDelete);
    };
  }, []);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);
  const cloudSaveTimer = useRef(null);
  const cloudSaveRetryTimerRef = useRef(null);
  const cloudHydratedRef = useRef(false);
  const cloudUserIdRef = useRef(null);
  const cloudSaveInFlightRef = useRef(false);
  const cloudSavePendingRef = useRef(null);
  const cloudSaveErrorShownAtRef = useRef(0);
  const cloudPendingRestoredRef = useRef(null);
  const latestDataRef = useRef(null);
  const localRevisionRef = useRef(0);
  const dailyBackupCheckedDayRef = useRef("");
  const pageExitSaveSentRef = useRef(false);
  const alarmLastTriggeredRef = useRef(new Set());
  const middayCheckShownRef = useRef("");
  latestDataRef.current = loaded ? data : null;
  const alarmScheduleKey = JSON.stringify(
    getConfiguredAlarms(data?.meta).map(alarm => ({
      id: alarm.id,
      enabled: Boolean(alarm.enabled),
      time: alarm.time,
      label: alarm.label,
      tone: alarm.tone,
    })),
  );

  useEffect(() => {
    const timer = setInterval(() => setDailyBackupTick(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkMidday = () => {
      if (!loaded || !data || welcomeReminderOpen || middayHabitCheckOpen) return;
      const now = new Date();
      const day = todayISO();
      const hour = now.getHours();
      const storageKey = `midday-habit-prompt-${storageScopeKey}-${day}`;
      if (hour >= 12 && hour < 16 && middayCheckShownRef.current !== storageKey && safeStorageGet(storageKey) !== "done") {
        middayCheckShownRef.current = storageKey;
        setMiddayHabitCheckOpen(true);
      }
    };
    checkMidday();
    const timer = setInterval(checkMidday, 60 * 1000);
    return () => clearInterval(timer);
  }, [loaded, data, storageScopeKey, welcomeReminderOpen, middayHabitCheckOpen]);

  const queueCloudSave = useCallback(
    (payload, targetUserId) => {
      if (!targetUserId || targetUserId !== activeUserIdRef.current) return;
      const pendingKey = cloudPendingStorageKey(targetUserId);
      cloudSavePendingRef.current = { payload, userId: targetUserId };
      safeStorageSet(
        pendingKey,
        JSON.stringify({ payload, userId: targetUserId, queuedAt: Date.now() }),
      );
      if (cloudSaveInFlightRef.current) return;

      cloudSaveInFlightRef.current = true;
      void (async () => {
        try {
          while (cloudSavePendingRef.current) {
            const pending = cloudSavePendingRef.current;
            cloudSavePendingRef.current = null;
            if (pending.userId !== activeUserIdRef.current) continue;
            try {
              await cloudSaveMutation.mutateAsync({
                userId: pending.userId,
                data: pending.payload,
              });
              if (
                !cloudSavePendingRef.current ||
                cloudSavePendingRef.current.userId !== pending.userId
              ) {
                safeStorageRemove(cloudPendingStorageKey(pending.userId));
              }
            } catch {
              // Keep the latest snapshot queued only while its account is active.
              if (pending.userId === activeUserIdRef.current) {
                cloudSavePendingRef.current = pending;
              }
              break;
            }
          }
        } finally {
          cloudSaveInFlightRef.current = false;
        }
      })();
    },
    [auth.user?.id, cloudSaveMutation]
  );

  useEffect(() => {
    const retryPendingCloudSave = () => {
      if (userId && latestDataRef.current && navigator.onLine !== false) {
        queueCloudSave(latestDataRef.current, userId);
        window.dispatchEvent(new CustomEvent("app-toast", { detail: "عاد الاتصال؛ جارٍ استكمال المزامنة السحابية." }));
      }
    };
    window.addEventListener("online", retryPendingCloudSave);
    return () => window.removeEventListener("online", retryPendingCloudSave);
  }, [userId, queueCloudSave]);

  const flushCloudSaveOnExit = useCallback(() => {
    const snapshot = latestDataRef.current;
    if (!snapshot || !loaded) return;
    // Flush the active account's latest local snapshot before the page exits.
    persistLocalSnapshot(snapshot, userId);
    if (pageExitSaveSentRef.current || !userId || typeof window === "undefined")
      return;
    pageExitSaveSentRef.current = true;
    const body = JSON.stringify(snapshot);
    void fetch("/api/learning-data/save", {
      method: "POST",
      body,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-LearnHub-User-ID": String(userId),
        ...getSessionHeaders(),
      },
      keepalive: true,
    }).catch(() => {});
  }, [userId, loaded]);

  const previousUserIdRef = useRef(undefined);
  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    cloudHydratedRef.current = false;
    cloudUserIdRef.current = null;
    cloudPendingRestoredRef.current = null;
    cloudSavePendingRef.current = null;
    setCloudReadyUserId(null);
    latestDataRef.current = null;
    localRevisionRef.current = 0;
    dailyBackupCheckedDayRef.current = "";
    pageExitSaveSentRef.current = false;
    alarmLastTriggeredRef.current = new Set();
    setNav({ screen: "dashboard", track: null, domainId: null, subtopicId: null });
    setWeeklyReportOpen(false);
    setDailyPlanOpen(false);
    setDeadlineModalOpen(false);
    setDeadlineAlert(null);
    setWelcomeReminderOpen(false);
    if (userId) {
      void trpcUtils.learningData.get.reset({ userId });
      void trpcUtils.learningData.versions.reset({ userId });
    }
  }, [userId]);

  useEffect(() => {
    if (auth.loading || (!userId && !auth.isGuest)) {
      setLoadedScope(null);
      setData(null);
      setProfileImage("");
      latestDataRef.current = null;
      return undefined;
    }
    let cancelled = false;
    setLoadedScope(null);
    setData(null);
    latestDataRef.current = null;
    (async () => {
      try {
        const [localSnapshot, durableSnapshot] = await Promise.all([
          readBestLocalSnapshot(userId),
          readDurableSnapshot(userId),
        ]);
        let parsed =
          pickNewestSnapshot([localSnapshot, durableSnapshot], hasLearningContent) || {};

        // Old versions stored guest data under one shared local key. Never
        // attach it to an account silently: ask once for each guest revision
        // and account, and keep the original guest copy on the device.
        if (userId) {
          const [guestLocalSnapshot, guestDurableSnapshot] = await Promise.all([
            Promise.resolve(readBestLocalSnapshot()),
            readDurableSnapshot(),
          ]);
          const guestSnapshot = pickNewestSnapshot(
            [guestLocalSnapshot, guestDurableSnapshot],
            hasLearningContent,
          );
          if (guestSnapshot) {
            const guestRevision = Number(guestSnapshot.meta?.localRevision || 0);
            const decisionKey = guestImportDecisionStorageKey(userId);
            const decision = safeJsonParse(safeStorageGet(decisionKey, ""), null);
            let importGuest = decision?.revision === guestRevision
              ? decision.imported === true
              : null;
            if (importGuest === null) {
              const accountLabel = auth.user?.name || auth.user?.email || "حسابك";
              importGuest = window.confirm(
                `وجدنا بيانات تعلّم محفوظة كضيف على هذا الجهاز. هل تريد استخدامها مع ${accountLabel}؟ إذا كانت أحدث من بيانات الحساب، ستتم مزامنتها كأحدث نسخة؛ وستظل نسخة الضيف المحلية محفوظة.`,
              );
              safeStorageSet(decisionKey, JSON.stringify({ revision: guestRevision, imported: importGuest }));
            }
            if (importGuest) {
              parsed = pickNewestSnapshot([parsed, guestSnapshot], hasLearningContent) || parsed;
            }
          }
        }
        if (cancelled) return;
        void requestDurableStorage();
        const savedSettings = safeJsonParse(
          safeStorageGet("self-learning-settings", "{}")
        );
        const nextSettings = {
          language: savedSettings.language || "ar",
          theme: savedSettings.theme || "dark",
          reviewSound: Boolean(savedSettings.reviewSound),
          reviewTone: savedSettings.reviewTone || "tone1",
          autoDailyBackup: savedSettings.autoDailyBackup !== false,
        };
        applyColorTheme(nextSettings.theme);
        setSettings(nextSettings);
        setProfileImage(safeStorageGet(profileImageStorageKey(userId), ""));
        const restored = normalizeAppData(parsed);
        localRevisionRef.current = Number(restored.meta?.localRevision || 0);
        setData(restored);
        latestDataRef.current = restored;
        if (hasLearningContent(restored)) {
          void persistLocalSnapshot(restored, userId);
        }
      } catch (e) {
        if (!cancelled) {
          const restored = normalizeAppData();
          localRevisionRef.current = 0;
          setData(restored);
          latestDataRef.current = restored;
        }
      } finally {
        if (!cancelled) setLoadedScope(storageScopeKey);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.loading, auth.isGuest, userId, storageScopeKey]);

  useEffect(() => {
    if (loaded) setWelcomeReminderOpen(true);
  }, [loaded]);

  useEffect(() => {
    const handlePageExit = () => flushCloudSaveOnExit();
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);
    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, [flushCloudSaveOnExit]);

  useEffect(() => {
    if (!userId) {
      cloudHydratedRef.current = false;
      cloudUserIdRef.current = null;
      cloudPendingRestoredRef.current = null;
      cloudSavePendingRef.current = null;
      setCloudReadyUserId(null);
      return;
    }
    if (cloudUserIdRef.current !== userId) {
      cloudUserIdRef.current = userId;
      cloudHydratedRef.current = false;
    }
    if (cloudPendingRestoredRef.current !== userId) {
      let storedPending = safeJsonParse(
        safeStorageGet(cloudPendingStorageKey(userId), ""),
        null,
      );
      if (!storedPending) {
        const legacyPending = safeJsonParse(safeStorageGet(CLOUD_PENDING_KEY, ""), null);
        if (legacyPending?.userId === userId && legacyPending.payload) {
          storedPending = legacyPending;
          safeStorageRemove(CLOUD_PENDING_KEY);
        }
      }
      if (storedPending?.userId === userId && storedPending.payload) {
        queueCloudSave(storedPending.payload, userId);
      }
      cloudPendingRestoredRef.current = userId;
    }
    if (
      !localLoaded ||
      !data ||
      remoteLearningQuery.isLoading ||
      remoteLearningQuery.isFetching ||
      cloudHydratedRef.current
    )
      return;

    const remoteData = remoteLearningQuery.isPlaceholderData
      ? undefined
      : remoteLearningQuery.data;
    if (remoteData && typeof remoteData === "object") {
      const remoteRevision = Number(remoteData.meta?.localRevision || 0);
      const localRevision = Number(data.meta?.localRevision || 0);
      const keepLocal =
        hasLearningContent(data) &&
        (!hasLearningContent(remoteData) || localRevision > remoteRevision);
      const next = keepLocal ? data : normalizeAppData(remoteData);
      localRevisionRef.current = Math.max(
        localRevisionRef.current,
        Number(next.meta?.localRevision || 0)
      );
      setData(next);
      void persistLocalSnapshot(next, userId);
      if (keepLocal) queueCloudSave(next, userId);
    } else if (remoteLearningQuery.isError === false) {
      queueCloudSave(data, userId);
    }
    cloudHydratedRef.current = true;
    setCloudReadyUserId(userId);
  }, [
    auth.user?.id,
    localLoaded,
    data,
    remoteLearningQuery.data,
    remoteLearningQuery.isLoading,
    remoteLearningQuery.isFetching,
    remoteLearningQuery.isError,
    remoteLearningQuery.isPlaceholderData,
    queueCloudSave,
  ]);

  useEffect(() => {
    const backupDay = todayISO();
    if (!loaded || !data || !settings.autoDailyBackup || dailyBackupCheckedDayRef.current === backupDay) return;
    if (userId && !cloudHydratedRef.current) return;
    const backupKey = dailyBackupStorageKey(userId);
    const current = safeJsonParse(safeStorageGet(backupKey, ""), null);
    const now = Date.now();
    if (current?.createdAt && now - Number(current.createdAt) < DAY_MS) {
      dailyBackupCheckedDayRef.current = backupDay;
      return;
    }
    dailyBackupCheckedDayRef.current = backupDay;
    const backup = { createdAt: now, date: backupDay, revision: Number(data.meta?.localRevision || 0), snapshot: data };
    safeStorageSet(backupKey, JSON.stringify(backup));
    void writeDurableBackup("daily", backup, userId);
    if (userId) queueCloudSave(data, userId);
  }, [loaded, data, settings.autoDailyBackup, userId, queueCloudSave, dailyBackupTick]);

  const persist = useCallback(
    next => {
    if (userId !== activeUserIdRef.current) return;
    const previousRevision = Math.max(
      localRevisionRef.current,
      Number(latestDataRef.current?.meta?.localRevision || 0),
      Number(next?.meta?.localRevision || 0),
    );
    const nextRevision = Math.max(Date.now(), previousRevision + 1);
    localRevisionRef.current = nextRevision;
    const stamped = {
      ...next,
      meta: { ...next.meta, localRevision: nextRevision },
    };
    latestDataRef.current = stamped;
    setData(stamped);
    setPulse(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setPulse(false), 900);
    // IndexedDB/localStorage and the cloud queue are intentionally debounced:
    // doing both for every keystroke made Arabic typing lag and move the caret.
    clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = setTimeout(() => {
        void persistLocalSnapshot(stamped, userId);
        if (userId) queueCloudSave(stamped, userId);
    }, 260);
    },
    [userId, queueCloudSave]
  );

  const persistLatest = useCallback(updater => {
    const current = latestDataRef.current;
    if (!current) return;
    const next = typeof updater === "function" ? updater(current) : updater;
    if (next && next !== current) persist(next);
  }, [persist]);

  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      clearTimeout(cloudSaveTimer.current);
      clearTimeout(cloudSaveRetryTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!loaded || !data) return;
    const history = data.meta.progressHistory || [];
    const reportKey = scopedStorageKey(`weekly-report-${weekKey()}`, userId);
    if (
      new Date().getDay() === 0 &&
      history.length &&
      safeStorageGet(reportKey) !== "shown"
    ) {
      setWeeklyReportOpen(true);
      safeStorageSet(reportKey, "shown");
    }
  }, [loaded, data, userId]);

  useEffect(() => {
    const handleToast = event => {
      setToast(event.detail || "تم الحفظ");
      clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(""), 2200);
    };
    window.addEventListener("app-toast", handleToast);
    return () => {
      window.removeEventListener("app-toast", handleToast);
      clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleSearchShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    const syncRinging = event => {
      setRingingAlarms(Array.isArray(event?.detail) ? event.detail : readRingingAlarms());
    };
    const unlockAndResumeSavedAlarm = () => {
      primeAlarmAudio();
      const active = readRingingAlarms();
      if (active.length) startAlarmTone(active[0].tone || "loud");
    };
    window.addEventListener("app-alarm-ringing", syncRinging);
    window.addEventListener("app-alarm-stopped", syncRinging);
    document.addEventListener("pointerdown", unlockAndResumeSavedAlarm, { once: true });
    document.addEventListener("keydown", unlockAndResumeSavedAlarm, { once: true });
    return () => {
      window.removeEventListener("app-alarm-ringing", syncRinging);
      window.removeEventListener("app-alarm-stopped", syncRinging);
      document.removeEventListener("pointerdown", unlockAndResumeSavedAlarm);
      document.removeEventListener("keydown", unlockAndResumeSavedAlarm);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    const alarms = getConfiguredAlarms(data?.meta).filter(
      alarm => alarm.enabled && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(alarm.time || "")),
    );
    if (!alarms.length) return undefined;
    const tick = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      alarms.forEach(alarm => {
        const triggerKey = `${todayISO()}-${alarm.id}-${alarm.time}`;
        if (currentTime !== alarm.time || alarmLastTriggeredRef.current.has(triggerKey)) return;
        alarmLastTriggeredRef.current.add(triggerKey);
        ringAlarm(
          `حان موعد ${alarm.label || "المنبه"}`,
          alarm.tone || "loud",
          `scheduled-${triggerKey}`,
        );
      });
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [loaded, alarmScheduleKey]);

  if (auth.loading) {
    return (
      <div style={styles.appShell}>
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
          <div style={{ color: COLORS.textDim, fontFamily: FONT_BODY }}>
            جارٍ التحقق من جلسة الدخول…
          </div>
        </div>
      </div>
    );
  }

  if (!auth.user) return <SignInRequiredScreen authError={auth.error} toast={toast} />;

  if (!loaded || !data) {
    return (
      <div style={styles.appShell}>
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
          <div style={{ color: COLORS.textDim, fontFamily: FONT_BODY }}>
            جارٍ مزامنة بيانات حسابك…
          </div>
        </div>
      </div>
    );
  }

  const domain = data.domains.find(d => d.id === nav.domainId) || null;
  const subtopic = domain
    ? domain.subtopics.find(s => s.id === nav.subtopicId)
    : null;
  const isTrackFocusScreen = nav.screen === "domains" || nav.screen === "lesson";

  const goto = patch =>
    setNav(previous => {
      const next = { ...previous, ...patch };
      if (patch.screen && patch.screen !== "domains") delete next.focusDate;
      if (patch.screen === "domains" && !patch.focusDate) delete next.focusDate;
      if (JSON.stringify(next) !== JSON.stringify(previous))
        navHistory.current.push(previous);
      return next;
    });

  const goBack = () => {
    const previous = navHistory.current.pop();
    if (previous) setNav(previous);
    else
      setNav({
        screen: "dashboard",
        track: null,
        domainId: null,
        subtopicId: null,
      });
  };

  const updateSettings = patch => {
    const next = { ...settings, ...patch };
    applyColorTheme(next.theme);
    setSettings(next);
    safeStorageSet("self-learning-settings", JSON.stringify(next));
    document.documentElement.dir = next.language === "en" ? "ltr" : "rtl";
    document.documentElement.lang = next.language;
  };

  const updateMeta = (key, value) => {
    const nextMeta = {
      ...data.meta,
      [key]: value,
      ...(key === "quarterlyPlans" ? { stageGoal: value?.q1 || "" } : {}),
    };
    if (key === "annualPlanDetails" && Array.isArray(value)) {
      const existingKeys = new Set(
        data.domains.map(domain => String(domain.name || "").trim().toLowerCase())
      );
      const addedDomains = value
        .filter(item => item && String(item.domain || "").trim())
        .filter(item => !existingKeys.has(String(item.domain).trim().toLowerCase()))
        .map(item => ({
          id: uid(),
          track: TRACKS[0].id,
          name: String(item.domain).trim(),
          description: "",
          plan: `الخطة السنوية — ${Number(item.hours || 0)} ساعة`,
          hours: Number(item.hours || 0),
          quarter: null,
          createdAt: todayISO(),
          subtopics: [{ ...emptySubtopic("الخطة"), isRoadmap: true }],
        }));
      persist({
        ...data,
        domains: [...data.domains, ...addedDomains],
        meta: nextMeta,
      });
      return;
    }
    persist({ ...data, meta: nextMeta });
  };

  inAppDeleteRequest = (label, action) => {
    setDeleteRequest({ label, action });
    return false;
  };



  // Only authenticated, cloud-ready accounts can reach the dashboard routes below.
  return (
    <div
      style={styles.appShell}
      className={`app-shell ${settings.theme === "light" ? "light-mode" : "dark-mode"} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isTrackFocusScreen ? "track-focus" : ""}`}
      dir={settings.language === "en" ? "ltr" : "rtl"}
    >
      <style>{globalCss}</style>
      <div style={styles.glowBlobTeal} className="glow-blob" />
      <div style={styles.glowBlobViolet} className="glow-blob" />
      <div style={styles.saveIndicator(pulse)}>تم الحفظ</div>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 260,
            padding: "9px 15px",
            borderRadius: 999,
            background: `${COLORS.teal}ee`,
            color: "#071311",
            fontSize: 12,
            fontWeight: 800,
            boxShadow: `0 10px 28px ${COLORS.teal}44`,
          }}
        >
          {toast}
        </div>
      )}
      {uploadJobs.length > 0 && (
        <aside
          role="status"
          aria-live="polite"
          aria-label="تقدم رفع الملفات"
          style={{
            position: "fixed",
            left: 14,
            bottom: "calc(92px + env(safe-area-inset-bottom))",
            zIndex: 300,
            width: "min(360px, calc(100vw - 28px))",
            boxSizing: "border-box",
            padding: 13,
            borderRadius: 15,
            border: `1px solid ${COLORS.border}`,
            background: `linear-gradient(145deg, ${COLORS.surface}, ${COLORS.surface2})`,
            color: COLORS.text,
            boxShadow: "0 12px 34px rgba(0,0,0,.32)",
          }}
        >
          <strong style={{ display: "block", color: COLORS.teal, fontSize: 12 }}>
            الرفع مستمر أثناء التنقل
          </strong>
          <span style={{ display: "block", marginTop: 3, color: COLORS.textDim, fontSize: 10 }}>
            يظل الملف قيد الرفع حتى لو انتقلت إلى تبويب آخر داخل LearnHub.
          </span>
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            {uploadJobs.map(job => (
              <div key={job.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10 }}>
                  <span title={job.name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.name}</span>
                  <span style={{ flex: "0 0 auto", color: COLORS.teal, fontWeight: 800 }}>{job.progress}%</span>
                </div>
                <div style={{ height: 5, marginTop: 5, overflow: "hidden", borderRadius: 99, background: `${COLORS.teal}22` }}>
                  <div style={{ width: `${job.progress}%`, height: "100%", borderRadius: 99, background: COLORS.teal, transition: "width 180ms ease" }} />
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
      {ringingAlarms.length > 0 && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label="تنبيه مستمر"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(86px + env(safe-area-inset-bottom))",
            transform: "translateX(-50%)",
            width: "min(560px, calc(100vw - 24px))",
            boxSizing: "border-box",
            zIndex: 1300,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "14px 16px",
            borderRadius: 16,
            border: "1px solid #FF7588",
            background: "linear-gradient(135deg, #4A1C2A, #201823)",
            color: "#FFFFFF",
            boxShadow: "0 12px 36px #0009",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", color: "#FF9BAA", fontSize: 13 }}>التنبيه يرن الآن</strong>
            <span style={{ display: "block", marginTop: 4, fontSize: 11, lineHeight: 1.5 }}>
              {ringingAlarms.map(item => item.label).filter(Boolean).join(" · ")}
            </span>
          </span>
          <button
            type="button"
            autoFocus
            onClick={stopAlarmTone}
            aria-label="إيقاف نغمة المنبه والمؤقت"
            style={{ ...styles.primaryBtn, flex: "0 0 auto", background: "#FF7588", color: "#241219", fontWeight: 900 }}
          >
            إيقاف الصوت
          </button>
        </div>
      )}
      {deleteRequest && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 1000 }}
        >
          <div
            style={{
              ...styles.deleteConfirmCard,
              position: "relative",
              zIndex: 1001,
            }}
          >
            <div style={styles.deleteConfirmIcon}>
              <Trash2 size={22} />
            </div>
            <div style={styles.modalEyebrow}>تأكيد الحذف</div>
            <h2 style={styles.modalTitle}>هل أنت متأكد؟</h2>
            <p style={styles.modalHint}>
              سيتم حذف {deleteRequest.label} نهائيًا، ولا يمكن التراجع عن هذا
              الإجراء.
            </p>
            <div style={styles.modalActions}>
              <button
                style={styles.deleteConfirmBtn}
                onClick={async () => {
                  if (!(await verifyStoredPin("أدخل PIN لتأكيد الحذف"))) return;
                  const action = deleteRequest.action;
                  setDeleteRequest(null);
                  action();
                }}
              >
                تأكيد الحذف
              </button>
              <button
                style={styles.ghostBtn}
                onClick={() => setDeleteRequest(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {welcomeReminderOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 200 }}
        >
          <div
            className="modal-panel"
            style={styles.reminderCard}
            onDoubleClick={() => setWelcomeReminderOpen(false)}
          >
            <div style={styles.reminderIcon}>
              <Bell size={24} />
            </div>
            <div style={styles.modalEyebrow}>تذكير عند الدخول</div>
            <h2 style={styles.modalTitle}>متنساش رؤيتك</h2>
            <p style={styles.reminderText}>
              متنساش رؤيتك، ومتنساش أبوك وأمك. خطوة صغيرة اليوم تقربك من هدفك
              وتحافظ على صلتك بأهلك.
            </p>
            <button
              style={{
                ...styles.primaryBtn,
                background: COLORS.teal,
                width: "100%",
              }}
              onClick={() => setWelcomeReminderOpen(false)}
            >
              حاضر، سأبدأ
            </button>
          </div>
        </div>
      )}
      {middayHabitCheckOpen && data && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ zIndex: 220 }}>
          <MiddayHabitCheck
            data={data}
            persist={persist}
            onClose={() => {
              safeStorageSet(`midday-habit-prompt-${storageScopeKey}-${todayISO()}`, "done");
              setMiddayHabitCheckOpen(false);
            }}
          />
        </div>
      )}

      <TopHeader
        meta={data.meta}
        onChangeMeta={updateMeta}
        onOpenPlans={() => goto({ screen: "plansHome", domainId: null, subtopicId: null })}
        onOpenDeadlines={() => setDeadlineModalOpen(true)}
        onOpenSearch={() => setGlobalSearchOpen(true)}
        onBack={goBack}
        showBack={nav.screen !== "dashboard"}
        showBackLabel={false}
        showCountdown={!isTrackFocusScreen}
      />

      <div className={`screenWrap ${nav.screen === "thoughts" ? "thoughts-screen-wrap" : ""}`} style={styles.screenWrap}>
        {nav.screen === "dashboard" && (
            <Dashboard
              data={data}
              persist={persist}
              goto={goto}
              onOpenSearch={() => setGlobalSearchOpen(true)}
              settings={settings}
              onOpenPlan={() => setDailyPlanOpen(true)}
              uploadAsset={uploadAsset}
              user={auth.user}
            />
        )}
        {nav.screen === "planPage" && (
          <DedicatedPlanPage
            data={data}
            persist={persist}
            nav={nav}
            goto={goto}
            userId={userId}
          />
        )}
        {nav.screen === "plansHome" && (
          <PlansHomeScreen goto={goto} onOpenDaily={() => setDailyPlanOpen(true)} />
        )}
        {nav.screen === "planWorkspace" && (
          <PlanWorkspaceScreen data={data} persist={persist} nav={nav} goto={goto} />
        )}
        {nav.screen === "thoughts" && (
          <ThoughtsScreen data={data} persist={persist} />
        )}
        {nav.screen === "time" && (
          <TimeScreen data={data} persist={persist} />
        )}
        {nav.screen === "progress" && <ProgressScreen data={data} />}
        {nav.screen === "achievements" && <AchievementsScreen data={data} goto={goto} />}
        {nav.screen === "self" && <SelfScreen goto={goto} />}
        {nav.screen === "aiTools" && <AIToolsScreen data={data} persist={persist} uploadAsset={uploadAsset} user={auth.user} />}
        {nav.screen === "vision" && <VisionScreen meta={data.meta} onChangeMeta={updateMeta} />}
        {nav.screen === "weeklyDay" && (
          <WeeklyDayPage data={data} persist={persist} nav={nav} goto={goto} uploadAsset={uploadAsset} />
        )}
        {nav.screen === "domains" && (
          <DomainsScreen data={data} persist={persist} nav={nav} goto={goto} goBack={goBack} isAuthenticated={Boolean(auth.user)} userId={userId} />
        )}
        {nav.screen === "settings" && (
          <SettingsScreen
            settings={settings}
            onChange={updateSettings}
            data={data}
            persist={persist}
            user={auth.user}
            profileImage={profileImage}
            onProfileImageChange={value => {
              if (userId !== activeUserIdRef.current) return;
              setProfileImage(value);
              safeStorageSet(profileImageStorageKey(userId), value);
            }}
            uploadAsset={uploadAsset}
            onLogin={() => startLogin()}
            onLogout={auth.logout}
          />
        )}
        {nav.screen === "habits" && (
          <HabitsScreen data={data} persist={persist} goto={goto} />
        )}
        {nav.screen === "aboutMe" && (
          <AboutMeScreen data={data} persist={persist} goto={goto} />
        )}
        {nav.screen === "habitTracker" && (
          <HabitTrackerScreen data={data} persist={persist} goto={goto} />
        )}
        {nav.screen === "lesson" && domain && subtopic && (
          subtopic.isRoadmap ? (
            <RoadmapScreen
              data={data}
              persist={persist}
              domain={domain}
              subtopic={subtopic}
              goto={goto}
            />
          ) : (
            <LessonScreen
              data={data}
              persist={persist}
              persistLatest={persistLatest}
              domain={domain}
              subtopic={subtopic}
              goto={goto}
              uploadAsset={uploadAsset}
            />
          )
        )}
      </div>

      {!isTrackFocusScreen && (
        <BottomNav
          nav={nav}
          goto={goto}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(value => !value)}
        />
      )}
      {dailyPlanOpen && (
        <DailyPlanModal
          data={data}
          persist={persist}
          onClose={() => setDailyPlanOpen(false)}
          goto={goto}
        />
      )}
      {weeklyReportOpen && (
        <WeeklyReportModal
          data={data}
          onClose={() => setWeeklyReportOpen(false)}
        />
      )}
      {deadlineModalOpen && (
        <DeadlineManager
          meta={data.meta}
          onClose={() => setDeadlineModalOpen(false)}
          onSave={deadlines => {
            updateMeta("deadlines", deadlines);
            setDeadlineModalOpen(false);
          }}
        />
      )}
      {globalSearchOpen && (
        <GlobalSearchModal
          data={data}
          onClose={() => setGlobalSearchOpen(false)}
          onNavigate={item => {
            setGlobalSearchOpen(false);
            goto({
              screen: item.screen || "dashboard",
              track: item.track || null,
              domainId: item.domainId || null,
              subtopicId: item.subtopicId || null,
              planKey: item.planKey || undefined,
            });
          }}
        />
      )}
      <InlineFilePreview request={inlinePreview} onClose={() => setInlinePreview(null)} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Top header — countdown + status bar                                    */
/* ---------------------------------------------------------------------- */

function VisionScreen({ meta, onChangeMeta }) {
  return (
    <div className="thoughtsScreen" style={styles.page}>
      <section style={{ ...styles.settingsHero, marginBottom: 14 }}>
        <div style={{ ...styles.settingsIcon, color: COLORS.gold, borderColor: `${COLORS.gold}55` }}><Eye size={23} /></div>
        <div><div style={styles.settingsTitle}>رؤيتي</div><div style={styles.settingsSubtitle}>الصورة الكبيرة التي توجه خططك كلها.</div></div>
      </section>
      <section style={{ ...styles.settingsSection, padding: 16 }}>
        <label style={styles.fieldLabel}>رؤيتي الشخصية</label>
        <RichTextEditor
          value={meta.vision || ""}
          onChange={value => onChangeMeta("vision", value)}
          placeholder="ما الصورة الكبرى التي تسعى إليها؟"
          ariaLabel="رؤيتي الشخصية"
          minHeight={170}
          style={{ ...styles.input, minHeight: 170, resize: "vertical" }}
        />
        <div style={{ color: COLORS.textDim, fontSize: 11, marginTop: 8 }}>يتم الحفظ تلقائيًا، وتظهر الرؤية هنا بدل شغل مساحة الصفحة الرئيسية.</div>
      </section>
    </div>
  );
}

function TopHeader({
  meta,
  onChangeMeta,
  onOpenPlans,
  onOpenDeadlines,
  onOpenSearch,
  onBack,
  showBack,
  showBackLabel = false,
  showCountdown = true,
}) {
  return (
    <div
      className="headerWrap"
      style={{ ...styles.headerWrap, ...(!showCountdown ? { minHeight: 62, boxSizing: "border-box" } : {}) }}
    >
      {showBack && (
        <button
          className="globalBackButton"
          style={{
            ...styles.globalBackButton,
            ...(showBackLabel ? { width: "auto", minWidth: 68, padding: "0 10px", gap: 6, whiteSpace: "nowrap" } : {}),
          }}
          onClick={onBack}
          aria-label="الرجوع إلى الشاشة السابقة"
        >
          <ChevronRight size={19} />
          {showBackLabel && <span>رجوع</span>}
        </button>
      )}
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="فتح البحث الشامل"
        title="بحث شامل — Ctrl/Cmd + K"
        style={{ ...styles.smallGhostBtn, display: "inline-flex", alignItems: "center", gap: 6, marginInlineStart: "auto", color: COLORS.teal, borderColor: `${COLORS.teal}55` }}
      >
        <Search size={15} /> <span className="headerSearchLabel">بحث</span>
      </button>
      {showCountdown && (
        <CountdownBoard
          deadlines={meta.deadlines || DEFAULT_DEADLINES}
          onOpen={onOpenDeadlines}
          onAlert={alert => {
            window.dispatchEvent(
              new CustomEvent("deadline-alert", { detail: alert })
            );
          }}
        />
      )}
    </div>
  );
}

function CountdownBoard({ deadlines, onOpen, onAlert }) {
  const [notice, setNotice] = useState(null);
  const alertedRef = useRef({});

  useEffect(() => {
    const handle = event => {
      setNotice(event.detail);
      window.setTimeout(() => setNotice(null), 9000);
    };
    window.addEventListener("deadline-alert", handle);
    return () => window.removeEventListener("deadline-alert", handle);
  }, []);

  const triggerAlert = (deadline, remainingHours) => {
    if (alertedRef.current[deadline.id]) return;
    alertedRef.current[deadline.id] = true;
    const alert = { label: deadline.label, remainingHours };
    onAlert(alert);
    setNotice(alert);
    window.setTimeout(() => setNotice(null), 9000);
    void notifyDevice(`اقترب موعد ${deadline.label}`, {
      body: `متبقٍ تقريبًا ${Math.ceil(remainingHours)} ساعة`,
      tag: `deadline-${deadline.id}`,
      url: "/?notification=deadline",
    });
  };

  return (
    <div className="countdown-board" style={styles.countdownBoard}>
      <div style={styles.countdownBoardTop}>
        <div style={styles.countdownEyebrow}>
          <Hourglass size={13} /> مواعيدك النهائية
        </div>
        <div style={styles.countdownBoardActions}>
          <button style={styles.manageDeadlinesBtn} onClick={onOpen}>
            <CalendarDays size={14} /> إدارة المواعيد
          </button>
        </div>
      </div>
      {notice && (
        <div className="deadline-alert" style={styles.deadlineAlert}>
          <span className="alert-pulse" style={styles.alertPulse} /> اقترب موعد{" "}
          <strong>{notice.label}</strong> — متبقٍ{" "}
          {Math.max(1, Math.ceil(notice.remainingHours))} ساعة
        </div>
      )}
      {deadlines.length ? (
        <div style={styles.deadlineGrid}>
          {deadlines.map(deadline => (
            <DeadlineCard
              key={deadline.id}
              deadline={deadline}
              onApproaching={triggerAlert}
            />
          ))}
        </div>
      ) : (
        <div style={styles.noDeadlineHint}>
          لا يوجد موعد مضاف. اضغط «إدارة المواعيد» وأضف الموعد الذي تريد ظهوره
          هنا.
        </div>
      )}
    </div>
  );
}

function DeadlineCard({ deadline, onApproaching }) {
  const { days, hours, minutes, seconds, ended, totalHours } = useCountdown(
    deadline.date
  );
  useEffect(() => {
    if (!ended && totalHours <= Number(deadline.alertHours || 24))
      onApproaching(deadline, totalHours);
  }, [ended, totalHours <= Number(deadline.alertHours || 24), deadline.id]);
  return (
    <div
      className="deadline-card"
      style={{ ...styles.deadlineCard, borderColor: `${deadline.color}55` }}
    >
      <div style={styles.deadlineCardTop}>
        <span
          style={{
            ...styles.deadlineDot,
            background: deadline.color,
            boxShadow: `0 0 10px ${deadline.color}`,
          }}
        />{" "}
        <span style={styles.deadlineLabel}>{deadline.label}</span>
        <span style={styles.deadlineDate}>
          {new Date(deadline.date).toLocaleDateString("ar-EG", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>
      {ended ? (
        <div style={styles.countdownEnded}>انتهى الموعد 🎯</div>
      ) : (
        <div style={styles.countdownRow}>
          <DigitBlock value={days} label="يوم" />
          <Colon />
          <DigitBlock value={hours} label="ساعة" />
          <Colon />
          <DigitBlock value={minutes} label="دقيقة" />
          <Colon />
          <DigitBlock value={seconds} label="ثانية" pulse />{" "}
        </div>
      )}
    </div>
  );
}

function DigitBlock({ value, label, pulse }) {
  return (
    <div style={styles.digitCol}>
      <div
        className={pulse ? "countdown-digit tick" : "countdown-digit"}
        style={styles.digitBox}
      >
        {String(value).padStart(2, "0")}
      </div>
      <span style={styles.digitLabel}>{label}</span>
    </div>
  );
}

function Colon() {
  return (
    <span className="blink" style={styles.colon}>
      :
    </span>
  );
}

const STATUS_CELLS = [
  {
    key: "vision",
    label: "الرؤية",
    icon: Eye,
    color: "#31E5C0",
    placeholder: "ما الصورة الكبرى التي تسعى إليها؟",
  },
  {
    key: "masterPlan",
    label: "الخطة السنوية",
    icon: Route,
    color: "#8B7CFF",
    placeholder: "المسار العام لتحقيق الرؤية خلال العام",
  },
  {
    key: "stageGoal",
    label: "الخطة الربع سنوية",
    icon: Target,
    color: "#5B8DEF",
    placeholder: "ما الذي تريد إنجازه خلال هذا الربع؟",
  },
];
const QUARTER_TABS = [
  { key: "q1", label: "الربع الأول" },
  { key: "q2", label: "الربع الثاني" },
  { key: "q3", label: "الربع الثالث" },
  { key: "q4", label: "الربع الرابع" },
];

function GoalTabs({ meta, onChangeMeta, onOpenPlans }) {
  const [activeKey, setActiveKey] = useState(null);
  const [activeQuarter, setActiveQuarter] = useState("q1");
  const [annualDomain, setAnnualDomain] = useState("");
  const [annualHours, setAnnualHours] = useState("");
  const annualPlanDetails = Array.isArray(meta.annualPlanDetails)
    ? meta.annualPlanDetails
    : [];
  const quarterlyPlans = {
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    ...(meta.quarterlyPlans || {}),
    ...(!meta.quarterlyPlans && meta.stageGoal ? { q1: meta.stageGoal } : {}),
  };
  return (
    <div className="goal-tabs" style={styles.goalTabs}>
      <div className="goal-tab-bar" style={styles.goalTabBar}>
        {STATUS_CELLS.map(cell => {
          const Icon = cell.icon;
          const active = activeKey === cell.key;
          return (
            <button
              key={cell.key}
              className="goal-tab-button"
              onClick={() => {
                if (cell.key === "masterPlan") return onOpenPlans("annual");
                if (cell.key === "stageGoal") return onOpenPlans("quarterly");
                setActiveKey(active ? null : cell.key);
              }}
              style={{
                ...styles.goalTabButton,
                color: active ? cell.color : COLORS.textDim,
                borderColor: active ? `${cell.color}66` : "transparent",
                background: active ? `${cell.color}12` : "transparent",
              }}
            >
              <Icon size={15} />
              <span>{cell.label}</span>
              {((cell.key === "stageGoal" &&
                Object.values(quarterlyPlans).some(value =>
                  String(value).trim()
                )) ||
                (cell.key === "masterPlan" && annualPlanDetails.length > 0) ||
                (cell.key !== "stageGoal" &&
                  cell.key !== "masterPlan" &&
                  typeof meta[cell.key] === "string" &&
                  meta[cell.key].trim())) && (
                <i style={{ ...styles.goalTabDot, background: cell.color }} />
              )}
            </button>
          );
        })}
      </div>
      {STATUS_CELLS.map(cell => {
        const Icon = cell.icon;
        if (activeKey !== cell.key) return null;
        return (
          <div
            key={cell.key}
            className="goal-editor"
            style={{ ...styles.goalEditor, borderColor: `${cell.color}44` }}
          >
            <div
              style={{
                ...styles.goalEditorIcon,
                color: cell.color,
                background: `${cell.color}18`,
              }}
            >
              <Icon size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...styles.goalEditorLabel, color: cell.color }}>
                {cell.label}
              </div>
              {cell.key === "masterPlan" ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px auto",
                      gap: 7,
                      alignItems: "center",
                    }}
                  >
                    <input
                      style={styles.input}
                      value={annualDomain}
                      onChange={e => setAnnualDomain(e.target.value)}
                      placeholder="المجال"
                    />
                    <input
                      style={styles.input}
                      type="number"
                      min="0"
                      step="0.5"
                      value={annualHours}
                      onChange={e => setAnnualHours(e.target.value)}
                      placeholder="عدد الساعات"
                    />
                    <button
                      type="button"
                      style={{
                        ...styles.smallGhostBtn,
                        background: "#2563EB",
                        borderColor: "#2563EB",
                        color: "#FFFFFF",
                      }}
                      onClick={() => {
                        const domain = annualDomain.trim();
                        const hours = Number(annualHours);
                        if (!domain || !Number.isFinite(hours) || hours <= 0)
                          return;
                        const existing = annualPlanDetails.find(
                          item =>
                            item.domain.trim().toLowerCase() ===
                            domain.toLowerCase()
                        );
                        const next = existing
                          ? annualPlanDetails.map(item =>
                              item.id === existing.id
                                ? { ...item, hours }
                                : item
                            )
                          : [
                              { id: uid(), domain, hours },
                              ...annualPlanDetails,
                            ];
                        onChangeMeta("annualPlanDetails", next);
                        setAnnualDomain("");
                        setAnnualHours("");
                        notifyApp(existing ? "تم تحديث الخطة بنجاح" : "تمت الإضافة بنجاح");
                      }}
                    >
                      <Plus size={15} /> إضافة
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
                    {annualPlanDetails.length ? (
                      annualPlanDetails.map(item => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 9px",
                            borderRadius: 9,
                            border: `1px solid ${cell.color}33`,
                            background: `${cell.color}08`,
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              color: COLORS.text,
                              fontSize: 12,
                            }}
                          >
                            {item.domain}
                          </span>
                          <strong style={{ color: cell.color, fontSize: 11 }}>
                            {item.hours} ساعة
                          </strong>
                          <button
                            type="button"
                            aria-label={`حذف ${item.domain}`}
                            style={styles.smallGhostBtn}
                            onClick={() =>
                              confirmDelete(`مجال ${item.domain}`, () =>
                                onChangeMeta(
                                  "annualPlanDetails",
                                  annualPlanDetails.filter(
                                    entry => entry.id !== item.id
                                  )
                                )
                              )
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: COLORS.textDim, fontSize: 11 }}>
                        أضف المجالات وعدد ساعات العمل السنوية لكل مجال.
                      </div>
                    )}
                  </div>
                </>
              ) : cell.key === "stageGoal" ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    {QUARTER_TABS.map(quarter => (
                      <button
                        key={quarter.key}
                        type="button"
                        onClick={() => setActiveQuarter(quarter.key)}
                        style={{
                          ...styles.goalTabButton,
                          padding: "7px 5px",
                          fontSize: 10,
                          color:
                            activeQuarter === quarter.key
                              ? cell.color
                              : COLORS.textDim,
                          borderColor:
                            activeQuarter === quarter.key
                              ? `${cell.color}66`
                              : "transparent",
                          background:
                            activeQuarter === quarter.key
                              ? `${cell.color}12`
                              : "transparent",
                        }}
                      >
                        {quarter.label}
                      </button>
                    ))}
                  </div>
                  <RichTextEditor
                    value={quarterlyPlans[activeQuarter] || ""}
                    onChange={value => {
                      const nextPlans = {
                        ...quarterlyPlans,
                        [activeQuarter]: value,
                      };
                      onChangeMeta("quarterlyPlans", nextPlans);
                    }}
                    placeholder={`اكتب خطة ${QUARTER_TABS.find(quarter => quarter.key === activeQuarter)?.label || "الربع"} هنا`}
                    ariaLabel="ملاحظات الخطة الربع سنوية"
                    minHeight={74}
                  />
                </>
              ) : (
                <RichTextEditor
                  value={meta[cell.key] || ""}
                  onChange={value => onChangeMeta(cell.key, value)}
                  placeholder={cell.placeholder}
                  ariaLabel={cell.label}
                  minHeight={74}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusCell({ cell, Icon, value, onChange }) {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <div className="status-cell" style={styles.statusCell}>
      <div
        style={{
          ...styles.statusIconWrap,
          color: cell.color,
          background: cell.color + "1a",
          boxShadow: `0 0 14px 0 ${cell.color}33`,
        }}
      >
        <Icon size={17} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...styles.statusLabel, color: cell.color }}>
          {cell.label}
        </div>
        <input
          style={styles.statusInput}
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={() => onChange(val)}
          placeholder={cell.placeholder}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Bottom navigation                                                      */
/* ---------------------------------------------------------------------- */

function PlansHomeScreen({ goto, onOpenDaily }) {
  const plans = [
    { key: "annual", label: "الخطة السنوية", hint: "الرؤية والمجالات الكبرى", color: "#8B7CFF", icon: Route },
    { key: "quarterly", label: "الخطة الربع سنوية", hint: "تحويل المجالات إلى أهداف مرحلية", color: "#5B8DEF", icon: Target },
    { key: "monthly", label: "الخطة الشهرية", hint: "أضف مهام الشهر ثم اربط كل مهمة بأسبوع", color: "#31C7B1", icon: CalendarDays },
    { key: "weekly", label: "الخطة الأسبوعية", hint: "خذ مهام الأسبوع من الشهرية ووزعها على الأيام", color: "#E8C468", icon: Layers },
    { key: "daily", label: "الخطة اليومية", hint: "تابع مهام اليوم فقط", color: "#E0719A", icon: CheckCircle2 },
  ];
  const openPlan = plan => {
    if (plan.key === "annual" || plan.key === "quarterly") {
      goto({ screen: "planPage", planKey: plan.key, domainId: null, subtopicId: null });
    } else if (plan.key === "monthly" || plan.key === "weekly") {
      goto({ screen: "planWorkspace", planKey: plan.key, domainId: null, subtopicId: null });
    } else {
      onOpenDaily?.();
    }
  };
  return (
    <div style={styles.page}>
      <section style={{ ...styles.settingsHero, marginBottom: 14 }}>
        <div style={{ ...styles.settingsIcon, color: COLORS.teal, borderColor: `${COLORS.teal}55`, background: `${COLORS.teal}18` }}><Layers size={23} /></div>
        <div>
          <div style={styles.settingsTitle}>خططي</div>
          <div style={styles.settingsSubtitle}>ابدأ من المستوى الأعلى وانتقل بالمهام حتى تصل إلى يومك.</div>
        </div>
      </section>
      <div style={{ display: "grid", gap: 12 }}>
        {plans.map(plan => {
          const Icon = plan.icon;
          return (
            <button key={plan.key} type="button" onClick={() => openPlan(plan)} style={{ width: "100%", minHeight: 92, display: "flex", alignItems: "center", gap: 14, padding: "17px 18px", borderRadius: 16, border: `1px solid ${plan.color}66`, background: `linear-gradient(110deg, ${plan.color}20, ${COLORS.surface})`, color: COLORS.text, textAlign: "right", cursor: "pointer", boxShadow: `0 8px 20px ${plan.color}12` }}>
              <span style={{ width: 48, height: 48, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 14, color: plan.color, background: `${plan.color}20`, border: `1px solid ${plan.color}44` }}><Icon size={23} /></span>
              <span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 16, fontFamily: FONT_HEAD }}>{plan.label}</strong><small style={{ display: "block", marginTop: 5, color: COLORS.textDim, fontSize: 11 }}>{plan.hint}</small></span>
              <ChevronLeft size={21} color={plan.color} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanWorkspaceScreen({ data, persist, nav, goto }) {
  const [activePlan, setActivePlan] = useState(nav.planKey === "weekly" ? "weekly" : "monthly");
  useEffect(() => setActivePlan(nav.planKey === "weekly" ? "weekly" : "monthly"), [nav.planKey]);
  return (
    <div style={styles.page}>
      <section style={{ ...styles.settingsHero, marginBottom: 12 }}>
        <div style={{ ...styles.settingsIcon, color: activePlan === "weekly" ? COLORS.gold : COLORS.teal }}><CalendarDays size={23} /></div>
        <div>
          <div style={styles.settingsTitle}>{activePlan === "weekly" ? "الخطة الأسبوعية" : "الخطة الشهرية"}</div>
          <div style={styles.settingsSubtitle}>{activePlan === "weekly" ? "وزّع مهام الأسبوع القادمة من الشهرية على أيامه" : "أضف المهام إلى الشهر ثم اربطها بأسابيع الشهر"}</div>
        </div>
      </section>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setActivePlan("monthly")} style={{ ...styles.goalTabButton, flex: 1, color: activePlan === "monthly" ? COLORS.teal : COLORS.textDim }}>الشهرية</button>
        <button type="button" onClick={() => setActivePlan("weekly")} style={{ ...styles.goalTabButton, flex: 1, color: activePlan === "weekly" ? COLORS.gold : COLORS.textDim }}>الأسبوعية</button>
      </div>
      <MonthlyPlanBoard data={data} persist={persist} view={activePlan} goto={goto} focusDate={nav.focusDate} />
    </div>
  );
}

function ThoughtsScreen({ data, persist }) {
  const thoughts = Array.isArray(data.meta.thoughts) ? data.meta.thoughts : [];
  const [openThoughtId, setOpenThoughtId] = useState(null);
  const saveThoughts = nextThoughts =>
    persist({ ...data, meta: { ...data.meta, thoughts: nextThoughts } });
  const addThought = () => {
    const next = { id: uid(), title: "", category: "", tags: "", sourceUrl: "", text: "", createdAt: todayISO(), updatedAt: todayISO() };
    saveThoughts([next, ...thoughts]);
    setOpenThoughtId(next.id);
    notifyApp("تمت إضافة خاطرة جديدة");
  };
  const updateThought = (id, patch) =>
    saveThoughts(thoughts.map(thought => thought.id === id ? { ...thought, ...patch, updatedAt: todayISO() } : thought));
  const deleteThought = id =>
    confirmDelete("الخاطرة", () => {
      saveThoughts(thoughts.filter(thought => thought.id !== id));
      if (openThoughtId === id) setOpenThoughtId(null);
      notifyApp("تم حذف الخاطرة");
    });

  return (
    <div className="thoughtsScreen" style={styles.page}>
      <section className="thoughtsHero" aria-labelledby="thoughts-title">
        <div className="thoughtsHeroIcon"><NotebookPen size={19} /></div>
        <div className="thoughtsHeroCopy">
          <div className="thoughtsHeroKicker">مساحتك الخاصة</div>
          <h1 id="thoughts-title">خواطري</h1>
          <p>اكتب الفكرة، صنّفها، واتركها محفوظة لتعود إليها وقتما تريد.</p>
        </div>
        <button type="button" className="thoughtsAddButton" onClick={addThought}>
          <Plus size={15} /> خاطرة جديدة
        </button>
      </section>
      <div className="thoughtsStats" aria-label="ملخص الخواطر">
        <span><strong>{thoughts.length}</strong> محفوظة</span>
        <span><CheckCircle2 size={13} /> حفظ تلقائي</span>
        <span><NotebookPen size={13} /> اضغط لفتحها</span>
      </div>
      {thoughts.length === 0 ? (
        <div className="thoughtsEmpty">
          <div className="thoughtsEmptyIcon"><NotebookPen size={23} /></div>
          <strong>مساحتك فارغة الآن</strong>
          <span>ابدأ بخاطرة صغيرة، وستُحفظ تلقائيًا أثناء الكتابة.</span>
          <button type="button" className="thoughtsAddButton" onClick={addThought}><Plus size={14} /> اكتب أول خاطرة</button>
        </div>
      ) : (
        <div className="thoughtsGrid">
          {thoughts.map((thought, index) => {
            const isOpen = openThoughtId === thought.id;
            return (
              <article key={thought.id} className={`thoughtCard ${isOpen ? "thoughtCardOpen" : "thoughtCardClosed"}`}>
                <div
                  className="thoughtFoldHeader"
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenThoughtId(isOpen ? null : thought.id)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") setOpenThoughtId(isOpen ? null : thought.id);
                  }}
                >
                  <div className="thoughtFoldTitleGroup">
                    <span className="thoughtFoldIndex">{String(index + 1).padStart(2, "0")}</span>
                    <input
                      value={thought.title || ""}
                      onChange={event => updateThought(thought.id, { title: event.target.value })}
                      onFocus={() => setOpenThoughtId(thought.id)}
                      onClick={event => event.stopPropagation()}
                      placeholder="عنوان الخاطرة…"
                      aria-label="عنوان الخاطرة"
                    />
                    <span className="thoughtFoldCategory">{thought.category || "بدون تصنيف"}{thought.tags ? ` · ${thought.tags}` : ""}</span>
                  </div>
                  <div className="thoughtFoldActions">
                    <span className="thoughtFoldChevron" aria-hidden="true">{isOpen ? "⌃" : "⌄"}</span>
                    <button type="button" onClick={event => { event.stopPropagation(); deleteThought(thought.id); }} aria-label="حذف الخاطرة" title="حذف الخاطرة" className="thoughtDeleteButton">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="thoughtFoldBody">
                    <div className="thoughtFields">
                      <label>العنوان<input value={thought.title || ""} onChange={event => updateThought(thought.id, { title: event.target.value })} placeholder="فكرة عن المستقبل" /></label>
                      <label>التصنيف<input value={thought.category || ""} onChange={event => updateThought(thought.id, { category: event.target.value })} placeholder="دراسة، شخصية، إيمانية" /></label>
                      <label>وسوم للبحث<input value={thought.tags || ""} onChange={event => updateThought(thought.id, { tags: event.target.value })} placeholder="مهم، مراجعة، مشروع" /></label>
                      <label>رابط المصدر أو المرفق<input type="url" value={thought.sourceUrl || ""} onChange={event => updateThought(thought.id, { sourceUrl: event.target.value })} placeholder="https://…" /></label>
                    </div>
                    <RichTextEditor value={thought.text || ""} onChange={value => updateThought(thought.id, { text: value })} placeholder="اكتب خاطرتك هنا…" ariaLabel="نص الخاطرة" minHeight={140} />
                    <div className="thoughtCardMeta">{thought.updatedAt || thought.createdAt || todayISO()} · {richTextToPlainText(thought.text).split(/\s+/).filter(Boolean).length} كلمة</div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
function TimeScreen({ data, persist }) {
  const [now, setNow] = useState(() => new Date());
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const timerAlertIdRef = useRef(uid());
  const timerAlertedRef = useRef(false);
  const alarms = getConfiguredAlarms(data.meta);
  const timerTone = data.meta.timerTone || "loud";
  const tones = [
    { key: "loud", label: "عالية", hint: "تنبيه قوي" },
    { key: "classic", label: "كلاسيكية", hint: "نغمتان متتاليتان" },
    { key: "soft", label: "هادئة", hint: "نغمات هادئة" },
    { key: "pulse", label: "نبضية", hint: "إيقاع متكرر" },
  ];
  const saveAlarms = nextAlarms => {
    const { alarm: legacyAlarm, ...metaWithoutLegacyAlarm } = data.meta;
    persist({ ...data, meta: { ...metaWithoutLegacyAlarm, alarms: nextAlarms } });
  };
  const updateAlarm = (id, patch) => {
    const current = alarms.find(item => item.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    if (updated.enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(updated.time || ""))) {
      notifyApp("أدخل وقتًا صحيحًا قبل تفعيل المنبه");
      return;
    }
    if (patch.enabled) primeAlarmAudio();
    saveAlarms(alarms.map(item => item.id === id ? updated : item));
  };
  const addAlarm = () => {
    saveAlarms([
      ...alarms,
      { id: uid(), label: `منبه ${alarms.length + 1}`, time: "08:00", tone: "loud", enabled: false },
    ]);
    notifyApp("تمت إضافة منبه جديد");
  };
  const removeAlarm = id => {
    const alarm = alarms.find(item => item.id === id);
    confirmDelete(`المنبه ${alarm?.label || "المحدد"}`, () => {
      saveAlarms(alarms.filter(item => item.id !== id));
      notifyApp("تم حذف المنبه");
    });
  };
  const formatDuration = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!timerRunning) return undefined;
    const id = window.setInterval(() => {
      setTimerSeconds(value => {
        if (value <= 1) {
          setTimerRunning(false);
          if (!timerAlertedRef.current) {
            timerAlertedRef.current = true;
            ringAlarm("انتهى المؤقت", timerTone, timerAlertIdRef.current);
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerTone]);
  useEffect(() => {
    if (!stopwatchRunning) return undefined;
    const id = window.setInterval(() => setStopwatchSeconds(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [stopwatchRunning]);

  return (
    <div style={{ ...styles.page, paddingBottom: 90 }}>
      <section style={{ border: `1px solid ${COLORS.gold}55`, borderRadius: 22, padding: "22px 20px", marginBottom: 16, background: `linear-gradient(135deg, ${COLORS.gold}18, ${COLORS.teal}0c)` }}>
        <div style={{ color: COLORS.gold, fontSize: 11, fontWeight: 900 }}>لوحة الوقت</div>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
          <div><h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: "clamp(28px, 5vw, 48px)", letterSpacing: 1 }}>{now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</h1><p style={{ margin: "6px 0 0", color: COLORS.textDim, fontSize: 12 }}>من هنا تضبط وقتك، منبهك، ومؤقت إنجازك.</p></div>
          <div style={{ color: COLORS.textDim, fontSize: 11 }}>{now.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, width: "100%", maxWidth: 980, margin: "0 auto" }}>
        <details open style={{ ...styles.settingsCard, width: "100%", boxSizing: "border-box", borderColor: `${COLORS.teal}55`, padding: "22px 24px" }}>
          <summary style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", listStyle: "none", marginBottom: 14 }}>
            <Bell size={19} color={COLORS.teal} /><strong style={{ fontSize: 17 }}>المنبّهات</strong>
            <span style={{ marginInlineStart: "auto", color: COLORS.teal, fontSize: 10 }}>{alarms.filter(item => item.enabled).length} مفعّل · {alarms.length} إجمالي</span>
            <span style={{ color: COLORS.teal, fontSize: 20 }}>⌄</span>
          </summary>
          <div style={{ display: "grid", gap: 12, paddingTop: 4 }}>
            {alarms.map((alarm, index) => (
              <article key={alarm.id} style={{ padding: 14, borderRadius: 13, border: `1px solid ${alarm.enabled ? `${COLORS.teal}55` : COLORS.border}`, background: alarm.enabled ? `${COLORS.teal}08` : COLORS.surface2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Bell size={15} color={alarm.enabled ? COLORS.teal : COLORS.textDim} />
                  <strong style={{ color: COLORS.text, fontSize: 12, flex: 1 }}>{alarm.label || `منبه ${index + 1}`}</strong>
                  <span style={{ color: alarm.enabled ? COLORS.teal : COLORS.textDim, fontSize: 10 }}>{alarm.enabled ? "مفعّل" : "متوقف"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(110px, .7fr)", gap: 8 }}>
                  <label style={{ ...styles.fieldLabel, margin: 0 }}>اسم المنبه
                    <input style={{ ...styles.input, marginTop: 5 }} value={alarm.label || ""} onChange={event => updateAlarm(alarm.id, { label: event.target.value })} placeholder="مثال: بداية المذاكرة" aria-label={`اسم المنبه ${index + 1}`} />
                  </label>
                  <label style={{ ...styles.fieldLabel, margin: 0 }}>الوقت
                    <input type="time" style={{ ...styles.input, marginTop: 5, fontSize: 18, fontWeight: 800 }} value={alarm.time || "08:00"} onChange={event => updateAlarm(alarm.id, { time: event.target.value })} aria-label={`وقت المنبه ${index + 1}`} />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, marginTop: 9 }}>
                  <select style={styles.input} value={alarm.tone || "loud"} onChange={event => updateAlarm(alarm.id, { tone: event.target.value })} aria-label={`نغمة المنبه ${index + 1}`}>
                    {tones.map(tone => <option key={tone.key} value={tone.key}>{tone.label} — {tone.hint}</option>)}
                  </select>
                  <button type="button" onClick={() => { primeAlarmAudio(); playAlarmPreview(alarm.tone || "loud"); }} style={{ ...styles.secondaryBtn, whiteSpace: "nowrap" }}>تجربة النغمة</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}>
                  <button type="button" onClick={() => updateAlarm(alarm.id, { enabled: !alarm.enabled })} style={{ ...styles.primaryBtn, background: alarm.enabled ? COLORS.teal : COLORS.surface, color: alarm.enabled ? "#071311" : COLORS.text, border: `1px solid ${COLORS.teal}55` }}>{alarm.enabled ? "إيقاف المنبه" : "تفعيل المنبه"}</button>
                  <button type="button" onClick={() => removeAlarm(alarm.id)} style={{ ...styles.secondaryBtn, color: COLORS.danger || "#FB7185" }}>حذف المنبه</button>
                </div>
              </article>
            ))}
            {alarms.length === 0 && <div style={styles.emptyCard}>أضف منبهًا للمذاكرة أو لأي موعد آخر، ويمكنك ضبط أكثر من منبه مستقل.</div>}
            <button type="button" onClick={addAlarm} style={{ ...styles.primaryBtn, width: "100%", background: `${COLORS.teal}18`, color: COLORS.teal, border: `1px dashed ${COLORS.teal}88` }}><Plus size={15} /> إضافة منبه</button>
          </div>
        </details>

        <details style={{ ...styles.settingsCard, width: "100%", boxSizing: "border-box", borderColor: `${COLORS.violet}55`, padding: "22px 24px" }}>
          <summary style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", listStyle: "none", marginBottom: 14 }}><Hourglass size={19} color={COLORS.violet} /><strong style={{ fontSize: 17 }}>المؤقت التنازلي</strong><span style={{ marginInlineStart: "auto", color: COLORS.violet, fontSize: 20 }}>⌄</span></summary>
          <div style={{ paddingTop: 4 }}>
            <div style={{ textAlign: "center", fontSize: 48, fontWeight: 900, color: COLORS.violet, letterSpacing: 2, padding: "15px 0" }}>{formatDuration(timerSeconds)}</div>
            <input type="number" min="1" max="999" disabled={timerRunning} value={Math.max(1, Math.ceil(timerSeconds / 60))} onChange={event => { timerAlertedRef.current = false; timerAlertIdRef.current = uid(); setTimerSeconds(Math.max(1, Number(event.target.value) || 1) * 60); }} style={{ ...styles.input, textAlign: "center" }} aria-label="دقائق المؤقت" />
            <label style={{ ...styles.fieldLabel, display: "block", marginTop: 10 }}>نغمة انتهاء المؤقت
              <select style={{ ...styles.input, marginTop: 5 }} value={timerTone} onChange={event => persist({ ...data, meta: { ...data.meta, timerTone: event.target.value } })}>
                {tones.map(tone => <option key={tone.key} value={tone.key}>{tone.label}</option>)}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => {
                if (timerRunning) { setTimerRunning(false); return; }
                primeAlarmAudio();
                if (timerSeconds <= 0) {
                  timerAlertedRef.current = false;
                  timerAlertIdRef.current = uid();
                  setTimerSeconds(25 * 60);
                }
                setTimerRunning(true);
              }} style={{ ...styles.primaryBtn, background: COLORS.violet }}>{timerRunning ? "إيقاف مؤقت" : "بدء المؤقت"}</button>
              <button type="button" onClick={() => { setTimerRunning(false); timerAlertedRef.current = false; timerAlertIdRef.current = uid(); setTimerSeconds(25 * 60); }} style={styles.secondaryBtn}>إعادة ضبط</button>
            </div>
          </div>
        </details>

        <details style={{ ...styles.settingsCard, width: "100%", boxSizing: "border-box", borderColor: `${COLORS.gold}55`, padding: "22px 24px" }}>
          <summary style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", listStyle: "none", marginBottom: 14 }}><Clock3 size={19} color={COLORS.gold} /><strong style={{ fontSize: 17 }}>العداد التصاعدي</strong><span style={{ marginInlineStart: "auto", color: COLORS.gold, fontSize: 20 }}>⌄</span></summary>
          <div style={{ paddingTop: 4 }}>
            <div style={{ textAlign: "center", fontSize: 48, fontWeight: 900, color: COLORS.gold, letterSpacing: 2, padding: "15px 0" }}>{formatDuration(stopwatchSeconds)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 40 }}><button type="button" onClick={() => setStopwatchRunning(value => !value)} style={{ ...styles.primaryBtn, background: COLORS.gold, color: "#1b1608" }}>{stopwatchRunning ? "إيقاف العداد" : "بدء العداد"}</button><button type="button" onClick={() => { setStopwatchRunning(false); setStopwatchSeconds(0); }} style={styles.secondaryBtn}>تصفير</button></div>
          </div>
        </details>
      </div>
      <div style={{ ...styles.settingsNote, marginTop: 14 }}>كل منبه محفوظ في بياناتك. عند انتهاء أي منبه أو مؤقت، تستمر النغمة حتى تضغط «إيقاف الصوت». يلزم بقاء التطبيق مفتوحًا، وقد تتطلب قيود المتصفح تفاعلًا لتشغيل الصوت.</div>
    </div>
  );
}
function AIToolsScreen({ data, persist, uploadAsset, user }) {
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", url: "", category: "learning" });
  const toolThemes = {
    learning: { label: "تعلم وبحث", icon: BookOpen, accent: "#4CD9C3", background: "linear-gradient(135deg, #123D4A, #102735 58%, #173F55)" },
    writing: { label: "كتابة ومحتوى", icon: FileText, accent: "#E8C468", background: "linear-gradient(135deg, #493719, #292319 58%, #5A4220)" },
    design: { label: "تصميم وصور", icon: ImageIcon, accent: "#C18CFF", background: "linear-gradient(135deg, #32204E, #201A3A 58%, #513176)" },
    coding: { label: "برمجة وتطوير", icon: GitBranch, accent: "#6EA7FF", background: "linear-gradient(135deg, #172E59, #152139 58%, #1F4D72)" },
    productivity: { label: "إنتاجية", icon: Target, accent: "#FF9C78", background: "linear-gradient(135deg, #4D2923, #2E2025 58%, #63312B)" },
    other: { label: "أخرى", icon: Sparkles, accent: "#9FB1C8", background: "linear-gradient(135deg, #253443, #182431 58%, #35465A)" },
  };
  const tools = Array.isArray(data.meta.aiTools) ? data.meta.aiTools : [];
  const progress = progressStats(data);
  const assistantContext = JSON.stringify({
    vision: richTextToPlainText(data.meta.vision).slice(0, 1200),
    masterPlan: richTextToPlainText(data.meta.masterPlan).slice(0, 1400),
    stageGoal: richTextToPlainText(data.meta.stageGoal).slice(0, 1000),
    aboutMe: data.meta.aboutMe && typeof data.meta.aboutMe === "object"
      ? Object.fromEntries(Object.entries(data.meta.aboutMe).map(([key, value]) => [key, richTextToPlainText(value).slice(0, 700)]))
      : richTextToPlainText(data.meta.aboutMe).slice(0, 1200),
    thoughts: (Array.isArray(data.meta.thoughts) ? data.meta.thoughts : []).slice(0, 8).map(thought => ({ title: thought.title, category: thought.category, text: richTextToPlainText(thought.text).slice(0, 600) })),
    assistantMemory: (Array.isArray(data.meta.assistantMemory) ? data.meta.assistantMemory : []).slice(-60),
    domains: (data.domains || []).slice(0, 30).map(domain => ({ name: domain.name, track: domain.track, titles: (domain.subtopics || []).slice(0, 15).map(subtopic => ({ title: subtopic.title, completed: Boolean(subtopic.completed), started: subtopic.dateStarted || null })) })),
    progress: { percent: progress.percent, total: progress.total, completed: progress.completed },
    planItems: Object.fromEntries(Object.entries(data.meta.planItems || {}).map(([key, items]) => [key, Array.isArray(items) ? items.slice(0, 10).map(item => ({ title: item.title, domain: item.domain, progress: item.progress, completed: item.completed })) : []])),
  }, null, 2).slice(0, 28000);
  const addTool = event => {
    event.preventDefault();
    const name = draft.name.trim();
    const rawUrl = draft.url.trim();
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try { new URL(url); } catch { notifyApp("اكتب رابطًا صحيحًا للأداة"); return; }
    if (!name) { notifyApp("اكتب اسم الأداة أولًا"); return; }
    const next = { id: uid(), name, url, category: draft.category, createdAt: todayISO() };
    persist({ ...data, meta: { ...data.meta, aiTools: [...tools, next] } });
    setDraft({ name: "", url: "", category: "learning" });
    setFormOpen(false);
    notifyApp("تمت إضافة الأداة");
  };
  const removeTool = id => {
    const tool = tools.find(item => item.id === id);
    confirmDelete(`الأداة ${tool?.name || "المحددة"}`, () => persist({ ...data, meta: { ...data.meta, aiTools: tools.filter(item => item.id !== id) } }));
  };
  const openTool = tool => { window.location.href = tool.url; };
  return (
    <div style={{ ...styles.page, paddingBottom: 90 }}>
      <section style={{ border: `1px solid ${COLORS.teal}44`, borderRadius: 24, padding: "24px 22px", background: `linear-gradient(135deg, ${COLORS.teal}16, ${COLORS.violet}12)`, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><div style={{ display: "flex", alignItems: "center", gap: 9, color: COLORS.teal, fontSize: 11, fontWeight: 900 }}><Sparkles size={18} /> مكتبتك الذكية</div><h1 style={{ margin: "8px 0 5px", fontFamily: FONT_HEAD, fontSize: "clamp(24px, 4vw, 36px)" }}>أدوات الذكاء الاصطناعي</h1><p style={{ margin: 0, color: COLORS.textDim, fontSize: 12, lineHeight: 1.8 }}>اجمع أدواتك المفضلة في مكان واحد، وصنّفها لتجد الأداة المناسبة بسرعة.</p></div>
          <button type="button" onClick={() => setFormOpen(value => !value)} style={{ ...styles.primaryBtn, background: COLORS.teal, color: "#062A27", minWidth: 150 }}><Plus size={16} /> إضافة أداة</button>
        </div>
      </section>
      {formOpen && <form onSubmit={addTool} style={{ ...styles.settingsCard, marginBottom: 16, borderColor: `${COLORS.teal}55` }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, alignItems: "end" }}><div><label style={styles.fieldLabel}>اسم الأداة</label><input autoFocus required style={styles.input} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="مثال: ChatGPT" /></div><div><label style={styles.fieldLabel}>رابط الأداة</label><input required type="url" style={styles.input} value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} placeholder="https://..." /></div><div><label style={styles.fieldLabel}>نوع الأداة</label><select style={styles.input} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{Object.entries(toolThemes).map(([key, theme]) => <option key={key} value={key}>{theme.label}</option>)}</select></div><button type="submit" style={{ ...styles.primaryBtn, background: COLORS.teal, color: "#062A27" }}>حفظ الأداة</button></div></form>}
      {tools.length === 0 ? <div style={{ ...styles.emptyCard, padding: 30, textAlign: "center" }}>لم تضف أدوات بعد. أضف اسم الأداة ورابطها، وستظهر هنا بخلفية مناسبة لنوعها.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>{tools.map(tool => { const theme = toolThemes[tool.category] || toolThemes.other; const Icon = theme.icon; return <article key={tool.id} onClick={() => openTool(tool)} role="link" tabIndex={0} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openTool(tool); }} style={{ position: "relative", overflow: "hidden", minHeight: 170, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 18, borderRadius: 20, border: `1px solid ${theme.accent}66`, background: theme.background, cursor: "pointer", boxShadow: "0 16px 34px rgba(3,10,24,.18)", transition: "transform .18s ease, box-shadow .18s ease" }}><div style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", insetInlineEnd: -55, top: -55, background: `${theme.accent}22` }} /><div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 14, color: theme.accent, background: `${theme.accent}22`, border: `1px solid ${theme.accent}44` }}><Icon size={20} /></span><button type="button" aria-label={`حذف ${tool.name}`} onClick={event => { event.stopPropagation(); removeTool(tool.id); }} style={{ border: 0, background: "rgba(0,0,0,.18)", color: "#FFF", borderRadius: 9, padding: 7, cursor: "pointer" }}><Trash2 size={15} /></button></div><div style={{ position: "relative" }}><strong style={{ display: "block", color: "#FFF", fontSize: 17 }}>{tool.name}</strong><span style={{ display: "inline-block", marginTop: 6, color: theme.accent, fontSize: 10, fontWeight: 800 }}>{theme.label}</span><div style={{ marginTop: 12, color: "rgba(255,255,255,.72)", fontSize: 10 }}>اضغط لفتح الأداة ↗</div></div></article>; })}</div>}
      <div style={{ ...styles.settingsNote, marginTop: 16 }}>تُحفظ الأدوات تلقائيًا. الضغط على بطاقة الأداة يفتح رابطها في نفس الصفحة، والخلفية تتغير تلقائيًا حسب نوعها.</div>
    </div>
  );
}

function SelfScreen({ goto }) {
  const items = [
    { key: "vision", title: "رؤيتي", description: "راجع رؤيتك وأهدافك واتجاهك القادم.", icon: Eye, color: COLORS.gold },
    { key: "habits", title: "عاداتي", description: "ابنِ عادات صغيرة تساعدك على الاستمرار كل يوم.", icon: Target, color: COLORS.teal },
    { key: "aboutMe", title: "معلومات حول نفسي", description: "أدر معلوماتك الشخصية وما يعبّر عنك.", icon: User, color: COLORS.violet },
  ];
  return (
    <div style={styles.page}>
      <section className="settingsHero" style={{ ...styles.settingsHero, marginBottom: 16 }}>
        <div style={{ ...styles.settingsIcon, color: COLORS.teal }}><User size={24} /></div>
        <div>
          <div className="settingsTitle" style={styles.settingsTitle}>نفسي</div>
          <div style={styles.settingsSubtitle}>مساحتك الشخصية لإدارة رؤيتك وعاداتك ومعلوماتك.</div>
        </div>
      </section>
      <div className="selfHubGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className="settingsSection selfHubCard"
              onClick={() => goto({ screen: item.key, domainId: null, subtopicId: null })}
              style={{ ...styles.settingsSection, textAlign: "start", cursor: "pointer", borderColor: `${item.color}55`, minHeight: 150, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <span style={{ width: 46, height: 46, display: "grid", placeItems: "center", borderRadius: 14, color: item.color, background: `${item.color}18`, border: `1px solid ${item.color}44` }}><Icon size={22} /></span>
              <span>
                <strong style={{ display: "block", color: COLORS.text, fontFamily: FONT_HEAD, fontSize: 16 }}>{item.title}</strong>
                <span style={{ display: "block", marginTop: 6, color: COLORS.textDim, fontSize: 11, lineHeight: 1.7 }}>{item.description}</span>
              </span>
              <span style={{ color: item.color, fontSize: 11, fontWeight: 800 }}>فتح القسم ←</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BottomNav({ nav, goto, collapsed, onToggle }) {
  const items = [
    { key: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
    { key: "plansHome", label: "خططي", icon: Layers },
    { key: "thoughts", label: "خواطري", icon: NotebookPen },
    { key: "time", label: "الوقت", icon: Bell },
    { key: "progress", label: "التقدم", icon: BarChart3 },
    { key: "self", label: "نفسي", icon: User },
    { key: "aiTools", label: "أدوات الذكاء الاصطناعي", icon: Sparkles },
    { key: "habitTracker", label: "متتبع العادات", icon: CheckCircle2 },
    { key: "settings", label: "الإعدادات", icon: Settings },
  ];
  const active = nav.screen === "lesson" ? "domains" : nav.screen;
  return (
    <nav className="bottomNav" style={styles.bottomNav}>
      <button
        className="sidebarToggle"
        style={styles.sidebarToggle}
        onClick={onToggle}
        aria-label={collapsed ? "إظهار القائمة" : "طي القائمة"}
      >
        {collapsed ? "☰" : "☰"}
      </button>
      {items.map(it => {
        const Icon = it.icon;
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            className="nav-btn"
            onClick={() =>
              goto({
                screen: it.key,
                domainId: null,
                subtopicId: null,
                track: it.key === "domains" ? nav.track : null,
              })
            }
            style={styles.navBtn(isActive)}
          >
            <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
            <span className="navLabel" style={{ fontSize: 12 }}>
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function shiftHabitDate(isoDate, delta) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

function HabitsScreen({ data, persist, goto }) {
  const [name, setName] = useState("");
  const habits = Array.isArray(data.meta.habits) ? data.meta.habits : [];
  const addHabit = event => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    if (habits.some(habit => habit.name.toLowerCase() === value.toLowerCase())) {
      notifyApp("هذه العادة موجودة بالفعل");
      return;
    }
    persist({
      ...data,
      meta: {
        ...data.meta,
        habits: [...habits, { id: uid(), name: value, createdAt: todayISO() }],
      },
    });
    setName("");
    notifyApp("تمت إضافة العادة");
  };
  const removeHabit = habit =>
    confirmDelete(`العادة ${habit.name}`, () => {
      persist({
        ...data,
        meta: {
          ...data.meta,
          habits: habits.filter(item => item.id !== habit.id),
        },
      });
      notifyApp("تم حذف العادة");
    });

  return (
    <div style={styles.page}>
      <div className="settingsHero" style={styles.settingsHero}>
        <div style={styles.settingsIcon}><Target size={23} /></div>
        <div>
          <div className="settingsTitle" style={styles.settingsTitle}>عاداتي</div>
          <div style={styles.settingsSubtitle}>أضف العادات الصغيرة التي تريد الالتزام بها يوميًا.</div>
        </div>
      </div>
      <section style={{ ...styles.settingsSection, marginTop: 14 }}>
        <div style={styles.settingsSectionTitle}>إضافة عادة جديدة</div>
        <form onSubmit={addHabit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="مثال: قراءة 20 دقيقة"
            aria-label="اسم العادة الجديدة"
            style={{ ...styles.input, flex: "1 1 220px", margin: 0 }}
          />
          <button type="submit" style={{ ...styles.primaryBtn, background: COLORS.teal, color: "#06221f" }}>
            <Plus size={15} /> إضافة العادة
          </button>
        </form>
      </section>
      <section style={{ ...styles.settingsSection, marginTop: 14 }}>
        <div style={styles.settingsSectionTitle}>العادات المضافة ({habits.length})</div>
        {habits.length === 0 ? (
          <div style={styles.emptyCard}>لم تضف عادات بعد. ابدأ بعادة واحدة بسيطة.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {habits.map(habit => (
              <div key={habit.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 12, background: COLORS.surface2 }}>
                <Target size={16} color={COLORS.teal} />
                <span style={{ flex: 1, color: COLORS.text, fontSize: 13 }}>{habit.name}</span>
                <button type="button" onClick={() => removeHabit(habit)} style={styles.smallGhostBtn} aria-label={`حذف ${habit.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <button type="button" onClick={() => goto({ screen: "habitTracker" })} style={{ ...styles.primaryBtn, marginTop: 14, background: COLORS.violet, color: "#fff" }}>
        <CheckCircle2 size={16} /> فتح متتبع العادات
      </button>
    </div>
  );
}

function AboutMeScreen({ data, persist }) {
  const saved = data.meta.aboutMe || {};
  const [form, setForm] = useState({
    identity: saved.identity || "",
    strengths: saved.strengths || "",
    growthAreas: saved.growthAreas || "",
    learningStyle: saved.learningStyle || "",
  });
  const saveField = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    persist({ ...data, meta: { ...data.meta, aboutMe: next } });
  };
  const fields = [
    { key: "identity", label: "من أنا؟", placeholder: "اكتب نبذة قصيرة عن نفسك وأهدافك…" },
    { key: "strengths", label: "نقاط قوتي", placeholder: "ما الأشياء التي تتميز بها وتساعدك في التعلم؟" },
    { key: "growthAreas", label: "أشياء أريد تطويرها", placeholder: "ما المهارات أو العادات التي تريد تحسينها؟" },
    { key: "learningStyle", label: "أسلوبي المفضل في التعلم", placeholder: "كيف تتعلم بشكل أفضل؟ قراءة، تطبيق، فيديو، نقاش…" },
  ];
  return (
    <div style={styles.page}>
      <div className="settingsHero" style={styles.settingsHero}>
        <div style={{ ...styles.settingsIcon, color: COLORS.violet, borderColor: `${COLORS.violet}55`, background: `${COLORS.violet}18` }}><User size={23} /></div>
        <div>
          <div className="settingsTitle" style={styles.settingsTitle}>معلومات حول نفسي</div>
          <div style={styles.settingsSubtitle}>مساحة شخصية تساعدك على فهم نفسك وبناء خطة تعلم تناسبك.</div>
        </div>
      </div>
      <section style={{ ...styles.settingsSection, marginTop: 14 }}>
        <div style={styles.settingsSectionTitle}>ملفي الشخصي للتعلم</div>
        <div style={{ display: "grid", gap: 12 }}>
          {fields.map(field => (
            <div key={field.key} style={{ display: "grid", gap: 6, color: COLORS.text, fontSize: 12, fontWeight: 800 }}>
              <div>{field.label}</div>
              <RichTextEditor
                value={form[field.key]}
                onChange={value => setForm({ ...form, [field.key]: value })}
                onBlur={() => saveField(field.key, form[field.key])}
                placeholder={field.placeholder}
                ariaLabel={field.label}
                minHeight={78}
                style={{ ...styles.input, minHeight: 78, resize: "vertical", margin: 0, lineHeight: 1.7, fontWeight: 500 }}
              />
            </div>
          ))}
        </div>
        <div style={{ color: COLORS.teal, fontSize: 11, marginTop: 12 }}>يتم حفظ المعلومات تلقائيًا عند الخروج من كل حقل.</div>
      </section>
    </div>
  );
}

function HabitTrackerScreen({ data, persist, goto }) {
  const habits = Array.isArray(data.meta.habits) ? data.meta.habits : [];
  const completions = data.meta.habitCompletions || {};
  const today = todayISO();
  const todayCompletions = completions[today] || {};
  const completedToday = habits.filter(habit => todayCompletions[habit.id]).length;
  const toggleHabit = habitId => {
    const nextToday = { ...todayCompletions, [habitId]: !todayCompletions[habitId] };
    persist({
      ...data,
      meta: {
        ...data.meta,
        habitCompletions: { ...completions, [today]: nextToday },
      },
    });
  };
  const recentDays = Array.from({ length: 7 }, (_, index) => shiftHabitDate(today, -index));

  return (
    <div style={styles.page}>
      <div className="settingsHero" style={styles.settingsHero}>
        <div style={styles.settingsIcon}><CheckCircle2 size={23} /></div>
        <div>
          <div className="settingsTitle" style={styles.settingsTitle}>متتبع العادات</div>
          <div style={styles.settingsSubtitle}>علّم على عاداتك كل يوم وتابع ثباتك خطوة بخطوة.</div>
        </div>
      </div>
      <section style={{ ...styles.settingsSection, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={styles.settingsSectionTitle}>اليوم</div>
            <div style={{ color: COLORS.textDim, fontSize: 11 }}>{formatArabicDate(today)}</div>
          </div>
          <strong style={{ color: COLORS.teal, fontSize: 18 }}>{completedToday}/{habits.length}</strong>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: COLORS.border, overflow: "hidden", margin: "12px 0 14px" }}>
          <div style={{ height: "100%", width: `${habits.length ? (completedToday / habits.length) * 100 : 0}%`, background: COLORS.teal, transition: "width 180ms ease-out" }} />
        </div>
        {habits.length === 0 ? (
          <div style={styles.emptyCard}>
            أضف عاداتك أولًا من تبويب <button type="button" onClick={() => goto({ screen: "habits" })} style={{ background: "none", border: 0, padding: 0, color: COLORS.teal, cursor: "pointer", fontWeight: 800 }}>عاداتي</button>.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {habits.map(habit => {
              const done = Boolean(todayCompletions[habit.id]);
              return (
                <button key={habit.id} type="button" onClick={() => toggleHabit(habit.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 13px", borderRadius: 12, border: `1px solid ${done ? COLORS.teal : COLORS.border}`, background: done ? `${COLORS.teal}14` : COLORS.surface2, color: COLORS.text, textAlign: "right", cursor: "pointer" }}>
                  <CheckCircle2 size={19} color={done ? COLORS.teal : COLORS.textDim} fill={done ? COLORS.teal : "none"} />
                  <span style={{ flex: 1, fontSize: 13 }}>{habit.name}</span>
                  <span style={{ fontSize: 10, color: done ? COLORS.teal : COLORS.textDim }}>{done ? "تم" : "لم تتم"}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      {habits.length > 0 && (
        <section style={{ ...styles.settingsSection, marginTop: 14 }}>
          <div style={styles.settingsSectionTitle}>آخر 7 أيام</div>
          <div style={{ display: "grid", gap: 7 }}>
            {recentDays.map(day => {
              const doneCount = habits.filter(habit => completions[day]?.[habit.id]).length;
              return (
                <div key={day} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: COLORS.textDim }}>
                  <span style={{ width: 92 }}>{formatArabicDate(day)}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 99, background: COLORS.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${habits.length ? (doneCount / habits.length) * 100 : 0}%`, background: COLORS.gold }} />
                  </div>
                  <strong style={{ color: doneCount === habits.length ? COLORS.teal : COLORS.text }}>{doneCount}/{habits.length}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsScreen({
  settings,
  onChange,
  data,
  persist,
  user,
  profileImage,
  onProfileImageChange,
  uploadAsset,
  onLogin,
  onLogout,
}) {
  const onProfileFileChange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const storedFile = await uploadAsset(file);
    if (storedFile) onProfileImageChange(storedFile.url);
  };
  const backupVersionsQuery = trpc.learningData.versions.useQuery(
    { userId: user?.id ?? 0 },
    {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: false,
    },
  );
  const restoreBackupMutation = trpc.learningData.restore.useMutation();
  const trpcUtils = trpc.useUtils();
  const [pinDraft, setPinDraft] = useState("");
  const [pinConfigured, setPinConfigured] = useState(() => Boolean(safeStorageGet(PIN_STORAGE_KEY, "")));
  const [notificationStatus, setNotificationStatus] = useState(() => getDeviceNotificationStatus());
  const enableDeviceNotifications = async () => {
    const nextStatus = await sendNotificationTest();
    setNotificationStatus(nextStatus);
    if (nextStatus === "granted") notifyApp("تم تفعيل إشعارات الجهاز وإرسال إشعار تجريبي");
    else if (nextStatus === "denied") notifyApp("الإشعارات مرفوضة من المتصفح؛ افتح إعدادات الموقع واسمح بها");
    else if (nextStatus === "unsupported") notifyApp("هذا المتصفح لا يدعم إشعارات الجهاز");
    else notifyApp("لم تكتمل صلاحية الإشعارات بعد");
  };
  const dailyBackupStatus = safeJsonParse(
    safeStorageGet(dailyBackupStorageKey(user?.id), ""),
    null,
  );
  const savePin = async () => {
    if (!/^\d{4,6}$/.test(pinDraft)) {
      notifyApp("اكتب PIN من 4 إلى 6 أرقام");
      return;
    }
    if (pinConfigured && !(await verifyStoredPin("أدخل PIN الحالي لتغييره"))) return;
    safeStorageSet(PIN_STORAGE_KEY, await hashPin(pinDraft));
    setPinDraft("");
    setPinConfigured(true);
    notifyApp("تم تفعيل قفل PIN");
  };
  const downloadBackup = () => {
    const payload = {
      app: "self-learning-dashboard",
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `self-learning-dashboard-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notifyApp("تم تنزيل بيانات اللوحة وروابط الملفات؛ الملفات نفسها محفوظة في التخزين السحابي.");
  };
  const importBackup = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidate = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
      if (!candidate || typeof candidate !== "object" || (!candidate.domains && !candidate.meta)) {
        throw new Error("الملف لا يحتوي على نسخة صالحة من بيانات التطبيق");
      }
      if (!(await verifyStoredPin("أدخل PIN لاسترجاع ملف النسخة الاحتياطية"))) return;
      if (!window.confirm("سيتم حفظ نسخة بياناتك الحالية أولًا ثم استبدالها بالنسخة المستوردة. هل تريد المتابعة؟")) return;
      persist(normalizeAppData(candidate));
      notifyApp("تم استرجاع النسخة الاحتياطية وحفظ النسخة الحالية قبل الاستبدال");
    } catch (error) {
      notifyApp(error instanceof Error ? error.message : "تعذر قراءة النسخة الاحتياطية");
    }
  };
  const restoreBackup = async revision => {
    if (!user) return;
    const accountId = user.id;
    if (!(await verifyStoredPin("أدخل PIN لاسترجاع النسخة السحابية"))) return;
    if (!window.confirm("سيتم استرجاع هذه النسخة وحفظ الحالة الحالية كنسخة جديدة. هل تريد المتابعة؟")) return;
    try {
      const result = await restoreBackupMutation.mutateAsync({
        userId: accountId,
        revision: Number(revision),
      });
      persist(normalizeAppData(result.data));
      await trpcUtils.learningData.versions.invalidate({ userId: accountId });
      notifyApp("تم استرجاع النسخة وحفظها كأحدث نسخة");
    } catch (error) {
      notifyApp(error instanceof Error ? error.message : "تعذر استرجاع النسخة");
    }
  };
  return (
    <div style={styles.page}>
      <div className="settingsHero" style={styles.settingsHero}>
        <div style={styles.settingsIcon}>
          <Settings size={23} />
        </div>
        <div>
          <div className="settingsTitle" style={styles.settingsTitle}>
            إعدادات التطبيق
          </div>
          <div style={styles.settingsSubtitle}>
            تحكم في اللغة والمظهر والتنبيهات بما يناسب طريقة استخدامك.
          </div>
        </div>
      </div>
      <section
        className="settingsSection accountSection"
        style={styles.settingsSection}
      >
        <div
          className="settingsSectionTitle"
          style={styles.settingsSectionTitle}
        >
          الحساب والمزامنة
        </div>
        {user ? (
          <div className="accountRow">
            <div className="accountAvatar" style={{ overflow: "hidden", padding: 0 }}>
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={`صورة ${user.name || "الحساب"}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                (user.name || "م").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="accountDetails">
              <strong>أهلاً {user.name || "محمد"} 👋</strong>
              <span>{user.email || "تم تسجيل الدخول"}</span>
              <small>{user.loginMethod === "google" ? "حساب Google / Gmail المستخدم في التسجيل." : "بيانات هذا الحساب محفوظة سحابيًا ومنفصلة عن الحسابات الأخرى، وتتم مزامنتها بين أجهزتك عند تسجيل الدخول بالحساب نفسه."}</small>
            </div>
            <button className="accountAction" onClick={onLogout}>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        ) : (
          <div className="accountRow accountGuest">
            <div className="accountAvatar">
              <span aria-hidden="true">☁</span>
            </div>
            <div className="accountDetails">
              <strong>المزامنة غير مفعلة</strong>
              <span>سجّل الدخول لحفظ بياناتك في السحابة</span>
              <small>
                بيانات الضيف تبقى محلية. عند تسجيل الدخول ستُحفظ بيانات الحساب منفصلة، ويمكنك اختيار استخدام بيانات الضيف لهذا الحساب.
              </small>
            </div>
            <button className="accountAction accountLogin" onClick={onLogin}>
              <span>تسجيل الدخول</span>
            </button>
          </div>
        )}
      </section>
      <section className="settingsSection" style={{ ...styles.settingsSection, borderColor: `${COLORS.gold}55` }}>
        <div className="settingsSectionTitle" style={styles.settingsSectionTitle}>إشعارات الموبايل والكمبيوتر</div>
        <div style={{ color: COLORS.textDim, fontSize: 10, lineHeight: 1.8, marginBottom: 11 }}>فعّلها لتصلك تنبيهات المنبهات والمواعيد النهائية على هذا الجهاز، سواء كنت داخل التطبيق أو في الخلفية. بعد التفعيل اضغط الزر لاختبار وصولها.</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9 }}>
          <button type="button" onClick={enableDeviceNotifications} style={{ ...styles.accountAction, display: "inline-flex", alignItems: "center", gap: 7, borderColor: notificationStatus === "granted" ? `${COLORS.teal}88` : `${COLORS.gold}88`, color: notificationStatus === "granted" ? COLORS.teal : COLORS.gold }}><Bell size={15} /> {notificationStatus === "granted" ? "إرسال إشعار تجريبي" : "تفعيل إشعارات الجهاز"}</button>
          <span style={{ color: notificationStatus === "granted" ? COLORS.teal : COLORS.textDim, fontSize: 10 }}>{notificationStatus === "granted" ? "مفعّلة على هذا الجهاز" : notificationStatus === "denied" ? "مرفوضة من إعدادات المتصفح" : notificationStatus === "unsupported" ? "غير مدعومة هنا" : "غير مفعّلة بعد"}</span>
        </div>
      </section>
      <section className="settingsSection" style={styles.settingsSection}>
        <div className="settingsSectionTitle" style={styles.settingsSectionTitle}>
          حماية البيانات والنسخ الاحتياطية
        </div>
        <div style={{ color: COLORS.textDim, fontSize: 10, lineHeight: 1.7, marginBottom: 12 }}>
          تُحفظ بيانات اللوحة والملفات سحابيًا بعد تسجيل الدخول، ويمكنك الوصول إليها من أي جهاز. تصدير JSON يشمل بيانات اللوحة وروابط الملفات فقط؛ الملفات نفسها تبقى في التخزين السحابي.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={downloadBackup} style={{ ...styles.accountAction, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={15} /> تنزيل بيانات اللوحة
          </button>
          <label style={{ ...styles.accountAction, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <FileUp size={15} /> استرجاع ملف
            <input type="file" accept="application/json,.json" onChange={importBackup} style={{ display: "none" }} />
          </label>
        </div>
        {user && (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: COLORS.text, fontSize: 11, fontWeight: 800, marginBottom: 7 }}>آخر النسخ السحابية</div>
            {backupVersionsQuery.isLoading ? (
              <div style={{ color: COLORS.textDim, fontSize: 10 }}>جارٍ تحميل سجل النسخ…</div>
            ) : backupVersionsQuery.data?.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {backupVersionsQuery.data.slice(0, 8).map(version => (
                  <div key={String(version.revision)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 9px", border: `1px solid ${COLORS.border}`, borderRadius: 9, background: COLORS.surface2 }}>
                    <span style={{ color: COLORS.textDim, fontSize: 9 }}>{new Date(version.savedAt).toLocaleString("ar-EG")}</span>
                    <button type="button" disabled={restoreBackupMutation.isPending} onClick={() => restoreBackup(version.revision)} style={{ ...styles.smallGhostBtn, color: COLORS.gold, borderColor: `${COLORS.gold}66` }}>
                      <RotateCcw size={12} /> استرجاع
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: COLORS.textDim, fontSize: 10 }}>سيظهر سجل النسخ بعد أول حفظ سحابي.</div>
            )}
          </div>
        )}
      </section>
      <section className="settingsSection" style={styles.settingsSection}>
        <div className="settingsSectionTitle" style={styles.settingsSectionTitle}>
          النسخ اليومية وقفل البيانات
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          <button type="button" onClick={() => onChange({ autoDailyBackup: !settings.autoDailyBackup })} style={{ ...styles.settingsOption, borderColor: settings.autoDailyBackup ? COLORS.teal : COLORS.border, background: settings.autoDailyBackup ? `${COLORS.teal}14` : COLORS.surface }}>
            <Save size={17} color={settings.autoDailyBackup ? COLORS.teal : COLORS.textDim} />
            <div style={{ flex: 1, textAlign: "start" }}>
              <strong>نسخ احتياطي تلقائي يومي</strong>
              <div style={{ color: COLORS.textDim, fontSize: 9, marginTop: 3 }}>ينشئ نسخة محلية يوميًا، ويستفيد من سجل النسخ السحابي عند تسجيل الدخول.</div>
            </div>
            {settings.autoDailyBackup && <CheckCircle2 size={17} color={COLORS.teal} />}
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <input type="password" inputMode="numeric" maxLength={6} value={pinDraft} onChange={event => setPinDraft(event.target.value.replace(/\\D/g, ""))} placeholder={pinConfigured ? "PIN جديد (اختياري للتغيير)" : "PIN من 4 إلى 6 أرقام"} style={{ ...styles.input, flex: "1 1 190px" }} />
            <button type="button" onClick={savePin} style={{ ...styles.accountAction, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Lock size={14} /> {pinConfigured ? "تغيير PIN" : "تفعيل PIN"}
            </button>
          </div>
          <div style={{ color: pinConfigured ? COLORS.teal : COLORS.textDim, fontSize: 9 }}>
            {pinConfigured ? "قفل PIN مفعّل قبل الحذف والاسترجاع." : "فعّل PIN حتى لا يتم الحذف أو الاسترجاع بالخطأ."}
          </div>
          <div style={{ color: COLORS.textDim, fontSize: 9 }}>
            آخر نسخة يومية: {dailyBackupStatus?.createdAt ? new Date(dailyBackupStatus.createdAt).toLocaleString("ar-EG") : "لم تُنشأ بعد"}
          </div>
        </div>
      </section>
      <section className="settingsSection" style={styles.settingsSection}>
        <div
          className="settingsSectionTitle"
          style={styles.settingsSectionTitle}
        >
          صورة محمد
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            className="accountAvatar"
            style={{ overflow: "hidden", padding: 0 }}
          >
            {profileImage ? (
              <img
                src={profileImage}
                alt="صورة محمد"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span>م</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 12 }}>
              ضع صورتك بجوار الاسم
            </div>
            <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 3 }}>
              ستظهر بجوار اسمك في إعدادات الحساب.
            </div>
          </div>
        </div>
      </section>
      <section className="settingsSection" style={styles.settingsSection}>
        <div
          className="settingsSectionTitle"
          style={styles.settingsSectionTitle}
        >
          اللغة
        </div>
        <div style={styles.settingsOptions}>
          {[
            { key: "ar", label: "العربية" },
            { key: "en", label: "English" },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => onChange({ language: item.key })}
              style={{
                ...styles.settingsOption,
                borderColor:
                  settings.language === item.key ? COLORS.teal : COLORS.border,
                background:
                  settings.language === item.key
                    ? `${COLORS.teal}14`
                    : COLORS.surface,
              }}
            >
              <strong>{item.label}</strong>
              {settings.language === item.key && (
                <CheckCircle2 size={17} color={COLORS.teal} />
              )}
            </button>
          ))}
        </div>
      </section>
      <section className="settingsSection" style={styles.settingsSection}>
        <div
          className="settingsSectionTitle"
          style={styles.settingsSectionTitle}
        >
          المظهر
        </div>
        <div style={styles.settingsOptions}>
          {[
            { key: "light", label: "فاتح", icon: Sun },
            { key: "dark", label: "داكن", icon: MoonStar },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => onChange({ theme: item.key })}
                style={{
                  ...styles.settingsOption,
                  borderColor:
                    settings.theme === item.key ? COLORS.gold : COLORS.border,
                  background:
                    settings.theme === item.key
                      ? `${COLORS.gold}14`
                      : COLORS.surface,
                }}
              >
                <Icon
                  size={18}
                  color={
                    settings.theme === item.key ? COLORS.gold : COLORS.textDim
                  }
                />
                <div style={{ flex: 1, textAlign: "start" }}>
                  <strong>{item.label}</strong>
                </div>
                {settings.theme === item.key && (
                  <CheckCircle2 size={17} color={COLORS.gold} />
                )}
              </button>
            );
          })}
        </div>
      </section>
      <div style={styles.settingsNote}>
        يتم حفظ اختيارك تلقائيًا على هذا الجهاز، ويمكنك تغييره في أي وقت.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                              */
/* ---------------------------------------------------------------------- */

function DailyPlanSpotlight({ data, persist, goto }) {
  const today = todayISO();
  const [battleOpen, setBattleOpen] = useState(true);
  const dailyItems = data.meta.planItems?.daily || [];
  const weeklyItems = (data.meta.weekTasks || []).map(task => {
    const resolved = resolveScheduledTask(data, task);
    return {
      ...resolved,
      id: `weekly-${task.id}`,
      weekTaskId: task.id,
      date: getWeekTaskDate(task) || task.plannedDate || today,
      progress: resolved.completed ? 100 : 0,
      battleKind: "weekly",
    };
  });
  const battleItems = [
    ...dailyBattleItems(dailyItems, today).map(item => ({
      ...item,
      battleKind: "daily",
    })),
    ...dailyBattleItems(weeklyItems, today),
  ].filter(item => !isReviewItem(item));
  const visibleItems = activeBattleItems(battleItems);
  const completedItems = battleItems.filter(
    item => Number(item.progress || 0) >= 100
  );
  const complete = item => {
    if (item.battleKind === "weekly") {
      return persist(updateScheduledTask(data, item.weekTaskId, true));
    }
    return persist({
      ...data,
      domains: data.domains.map(domain => ({
        ...domain,
        subtopics: domain.subtopics.map(sub =>
          String(domain.name || "").trim().toLowerCase() === String(item.domain || "").trim().toLowerCase() &&
          String(sub.title || "").trim().toLowerCase() === String(item.title || "").trim().toLowerCase()
            ? {
                ...sub,
                dateStarted: sub.dateStarted || todayISO(),
                reviewDone: Array(REVIEW_STAGES.length).fill(false),
              }
            : sub
        ),
      })),
      meta: {
        ...data.meta,
        planItems: {
          ...data.meta.planItems,
          daily: dailyItems.map(entry =>
            entry.id === item.id ? { ...entry, progress: 100 } : entry
          ),
        },
      },
    });
  };
  const dailyPercent = battleItems.length
    ? Math.round((completedItems.length / battleItems.length) * 100)
    : 0;
  return (
    <section
      className="daily-spotlight"
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 13,
        border: `1px solid ${COLORS.teal}44`,
        background: `linear-gradient(135deg, ${COLORS.teal}12, ${COLORS.violet}10)`,
      }}
    >
      <button
        type="button"
        aria-expanded={battleOpen}
        aria-controls="daily-battle-content"
        onClick={() => setBattleOpen(value => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          marginBottom: 8,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "inherit",
          textAlign: "right",
          cursor: "pointer",
        }}
      >
        <div>
          <div style={{ color: COLORS.teal, fontSize: 11, fontWeight: 800 }}>
            المعركة اليومية
          </div>
          <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 3 }}>
            مهام اليوم والمتأخرة — المراجعات موجودة في لوحة المراجعة
          </div>
        </div>
        <div style={{ color: COLORS.teal, fontSize: 11, fontWeight: 800 }}>
          {visibleItems.length} مهمة
        </div>
      </button>
      {battleOpen && <div id="daily-battle-content">
      <div
        style={{
          marginBottom: 10,
          padding: "10px 11px",
          borderRadius: 11,
          border: `1px solid ${COLORS.teal}44`,
          background: `${COLORS.teal}0b`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <strong style={{ color: COLORS.teal, fontSize: 11 }}>
            تقدم اليوم
          </strong>
          <span style={{ color: COLORS.textDim, fontSize: 10 }}>
            {completedItems.length} من {visibleItems.length} مكتملة ·{" "}
            {dailyPercent}%
          </span>
        </div>
        <div
          style={{
            height: 6,
            marginTop: 8,
            borderRadius: 99,
            background: COLORS.border,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${dailyPercent}%`,
              height: "100%",
              borderRadius: 99,
              background: COLORS.teal,
            }}
          />
        </div>
        {completedItems.length > 0 && (
          <div style={{ display: "grid", gap: 3, marginTop: 8 }}>
            {completedItems.map(item => (
              <div
                key={`done-${item.id}`}
                style={{
                  color: COLORS.textDim,
                  fontSize: 10,
                  textDecoration: "line-through",
                }}
              >
                ✓ {item.domain} · {item.title}{" "}
                <span style={{ color: COLORS.teal, textDecoration: "none" }}>
                  تمت
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {visibleItems.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {visibleItems.map(item => {
            const overdue = (item.date || today) < today;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  textAlign: "right",
                  border: `1px solid ${overdue ? COLORS.gold + "66" : COLORS.border}`,
                  borderRadius: 10,
                  padding: "6px 8px",
                  background: COLORS.surface,
                }}
              >
                <button
                  type="button"
                  onClick={() => complete(item)}
                  aria-label="إكمال العنوان"
                  style={{ border: 0, background: "transparent", padding: 2, cursor: "pointer" }}
                >
                  <CheckCircle2
                    size={17}
                    color={overdue ? COLORS.gold : COLORS.textDim}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openScheduledTitle(data, item, goto)}
                  disabled={!item.subtopicId}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "right",
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    color: COLORS.text,
                    cursor: item.subtopicId ? "pointer" : "default",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      fontSize: 10,
                      color: overdue ? COLORS.gold : COLORS.teal,
                    }}
                  >
                    {item.domain}
                  </strong>
                  <span style={{ display: "block", fontSize: 11, marginTop: 1 }}>
                    {item.title}
                  </span>
                </button>
                <span
                  style={{
                    color: overdue ? COLORS.gold : COLORS.textDim,
                    fontSize: 10,
                  }}
                >
                  {overdue ? "متأخرة" : "إنجاز"}
                </span>
              </div>
            );
          })}
          {completedItems.map(item => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                border: `1px solid ${COLORS.teal}55`,
                borderRadius: 10,
                padding: "9px 10px",
                background: `${COLORS.teal}12`,
                color: COLORS.textDim,
              }}
            >
              <CheckCircle2 size={17} color={COLORS.teal} />
              <span style={{ flex: 1 }}>
                <strong
                  style={{ display: "block", fontSize: 11, color: COLORS.teal }}
                >
                  {item.domain}
                </strong>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    marginTop: 2,
                    textDecoration: "line-through",
                  }}
                >
                  {item.title}
                </span>
              </span>
              <span
                style={{ color: COLORS.teal, fontSize: 10, fontWeight: 800 }}
              >
                إنجاز
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: COLORS.textDim, fontSize: 11, padding: "9px 0" }}>
          لا توجد مهام مستحقة اليوم.
        </div>
      )}
      </div>}
    </section>
  );
}

function ProgressScreen({ data }) {
  const planItems = data.meta.planItems || DEFAULT_PLAN_ITEMS;
  const today = todayISO();
  const now = new Date(`${today}T12:00:00`);
  const weekStart = getCalendarWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartKey = formatLocalCalendarDate(weekStart);
  const weekEndKey = formatLocalCalendarDate(weekEnd);
  const weekTasks = data.meta.weekTasks || [];
  const weeklyItems = weekTasks.filter(task => {
    const date = getWeekTaskDate(task) || task.plannedDate || "";
    return date >= weekStartKey && date <= weekEndKey;
  });
  const monthKey = `m${now.getMonth() + 1}`;
  const quarterKey = `q${Math.floor(now.getMonth() / 3) + 1}`;
  const monthlyItems = (planItems.monthly || []).filter(item => item.month === monthKey);
  const quarterlyItems = (planItems.quarterly || []).filter(item => (item.quarter || "q1") === quarterKey);
  const dailyItems = dailyBattleItems(planItems.daily || [], today);
  const summarize = (items, getProgress) => {
    const values = items.map(item => Math.max(0, Math.min(100, Number(getProgress(item)) || 0)));
    const percent = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return { percent, done: values.filter(value => value >= 100).length, total: values.length };
  };
  const metrics = [
    { key: "daily", label: "التقدم اليومي", subtitle: "إنجاز مهام اليوم", color: COLORS.gold, icon: Clock3, stats: summarize(dailyItems, item => item.progress) },
    { key: "weekly", label: "التقدم الأسبوعي", subtitle: `${weekStartKey} — ${weekEndKey}`, color: COLORS.violet, icon: CalendarDays, stats: summarize(weeklyItems, item => item.completed || Number(item.progress) >= 100 ? 100 : item.progress) },
    { key: "monthly", label: "التقدم الشهري", subtitle: "إنجاز خطة الشهر الحالي", color: COLORS.teal, icon: Target, stats: summarize(monthlyItems, item => weeklyTaskProgress(item, weekTasks)) },
    { key: "quarterly", label: "التقدم الربع سنوي", subtitle: "إنجاز الربع الحالي", color: "#5B8DEF", icon: Layers, stats: summarize(quarterlyItems, item => quarterlyItemProgress(item, planItems.monthly || [], weekTasks)) },
  ];
  const overall = progressStats(data);
  return (
    <div style={{ ...styles.page, paddingBottom: 90 }}>
      <section className="progressHero" style={{ border: `1px solid ${COLORS.teal}44`, background: `linear-gradient(135deg, ${COLORS.teal}18, ${COLORS.violet}12)`, borderRadius: 22, padding: "22px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: COLORS.teal, fontSize: 11, fontWeight: 900, letterSpacing: .4 }}>لوحة الأداء</div>
            <h1 style={{ margin: "7px 0 5px", fontFamily: FONT_HEAD, fontSize: "clamp(24px, 4vw, 36px)" }}>تقدمك بصورة واضحة</h1>
            <p style={{ margin: 0, color: COLORS.textDim, fontSize: 12, lineHeight: 1.8 }}>تابع إيقاعك اليومي، ثم شاهد كيف يتراكم إلى أسبوع وشهر وربع سنوي.</p>
          </div>
          <div style={{ width: 112, height: 112, borderRadius: "50%", display: "grid", placeItems: "center", background: `conic-gradient(${COLORS.teal} ${overall.percent * 3.6}deg, ${COLORS.border} 0deg)`, boxShadow: `0 0 0 8px ${COLORS.teal}12` }}>
            <div style={{ width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center", background: COLORS.surface }}><strong style={{ color: COLORS.teal, fontSize: 24 }}>{overall.percent}%</strong></div>
          </div>
        </div>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 14 }}>
        {metrics.map(metric => {
          const Icon = metric.icon;
          return (
            <article key={metric.key} style={{ position: "relative", overflow: "hidden", border: `1px solid ${metric.color}44`, borderRadius: 18, padding: 17, background: `linear-gradient(145deg, ${metric.color}12, ${COLORS.surface})`, boxShadow: "0 14px 30px rgba(3,10,24,.13)" }}>
              <div style={{ position: "absolute", insetInlineEnd: -24, top: -28, width: 100, height: 100, borderRadius: "50%", background: `${metric.color}12` }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}><span style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 12, color: metric.color, background: `${metric.color}1c` }}><Icon size={19} /></span><div><strong style={{ display: "block", fontSize: 15 }}>{metric.label}</strong><small style={{ color: COLORS.textDim, fontSize: 10 }}>{metric.subtitle}</small></div></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 20 }}><strong style={{ color: metric.color, fontSize: 34, lineHeight: 1 }}>{metric.stats.percent}%</strong><span style={{ color: COLORS.textDim, fontSize: 10 }}>{metric.stats.done} من {metric.stats.total} مكتملة</span></div>
              <div style={{ height: 9, marginTop: 13, borderRadius: 99, background: COLORS.border, overflow: "hidden" }}><div style={{ width: `${metric.stats.percent}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${metric.color}, ${metric.color}aa)`, transition: "width .3s ease" }} /></div>
            </article>
          );
        })}
      </div>
      <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 13, border: `1px solid ${COLORS.border}`, color: COLORS.textDim, fontSize: 11, lineHeight: 1.8 }}>يتم احتساب كل فترة بشكل مستقل من مهامها الحالية؛ لذلك قد تختلف نسبة اليوم عن الأسبوع أو الشهر أو الربع السنوي.</div>
    </div>
  );
}

function PlanSummaryStrip({ data }) {
  const planItems = data.meta.planItems || DEFAULT_PLAN_ITEMS;
  const weekTasks = data.meta.weekTasks || [];
  const monthlyItems = planItems.monthly || [];
  const summaries = [
    {
      key: "monthly",
      label: "الخطة الشهرية",
      color: "#31C7B1",
      items: monthlyItems,
    },
    {
      key: "weekly",
      label: "الخطة الأسبوعية",
      color: "#E8C468",
      items: monthlyItems.filter(item => item.week),
    },
  ];
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 10,
        marginTop: 14,
      }}
      className="homepage-plan-summaries"
    >
      {summaries.map(summary => {
        const itemProgress = item => {
          if (summary.key === "annual")
            return annualItemProgress(
              item,
              planItems.quarterly || [],
              monthlyItems,
              weekTasks
            );
          if (summary.key === "quarterly")
            return quarterlyItemProgress(item, monthlyItems, weekTasks);
          if (summary.key === "monthly" || summary.key === "weekly")
            return weeklyTaskProgress(item, weekTasks);
          return Number(item.progress || 0);
        };
        const progress = summary.items.length
          ? Math.round(
              summary.items.reduce((sum, item) => sum + itemProgress(item), 0) /
                summary.items.length
            )
          : 0;
        return (
          <div
            key={summary.key}
            style={{
              border: `1px solid ${summary.color}44`,
              borderRadius: 12,
              background: COLORS.surface,
              padding: "10px 11px",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <strong style={{ color: summary.color, fontSize: 11 }}>
                {summary.label}
              </strong>
              <span style={{ color: COLORS.textDim, fontSize: 10 }}>
                {progress}%
              </span>
            </div>
            <div
              style={{
                height: 5,
                background: COLORS.border,
                borderRadius: 20,
                margin: "8px 0",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  borderRadius: 20,
                  background: summary.color,
                }}
              />
            </div>
            <div style={{ display: "grid", gap: 3 }}>
                {summary.items.slice(0, 2).map(item => (
                <div
                  key={item.id}
                  style={{
                    color: COLORS.textDim,
                    fontSize: 9.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  • {item.domain} · {item.title} · {itemProgress(item)}%
                </div>
              ))}
              {!summary.items.length && (
                <div style={{ color: COLORS.textDim, fontSize: 9.5 }}>
                  {summary.key === "annual"
                    ? "أضف المجالات من الخطة السنوية"
                    : "اختر عناصر من المستوى الأعلى لربطها هنا"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function StudySessionTimer({ userId = null }) {
  const storageKey = scopedStorageKey("study-session-timer", userId);
  const [hydratedStorageKey, setHydratedStorageKey] = useState(null);
  const hydrated = hydratedStorageKey === storageKey;
  const [expanded, setExpanded] = useState(false);
  const [duration, setDuration] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const previousRemaining = useRef(remaining);
  const completionAlertIdRef = useRef(uid());

  useEffect(() => {
    setHydratedStorageKey(null);
    setExpanded(false);
    setDuration(25);
    setRemaining(25 * 60);
    setRunning(false);
    previousRemaining.current = 25 * 60;
    completionAlertIdRef.current = uid();
    try {
      const saved = JSON.parse(safeStorageGet(storageKey) || "null");
      if (
        saved &&
        Number.isFinite(saved.duration) &&
        Number.isFinite(saved.remaining)
      ) {
        const restoredRemaining = Math.max(0, saved.remaining);
        setDuration(Math.min(180, Math.max(5, saved.duration)));
        previousRemaining.current = restoredRemaining;
        setRemaining(restoredRemaining);
        setRunning(Boolean(saved.running) && restoredRemaining > 0);
      }
    } catch {
      // Use the default session when stored data is unavailable.
    }
    setHydratedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !running) return undefined;
    const interval = window.setInterval(() => {
      setRemaining(current => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return advanceStudyTimer(current);
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hydrated, running]);

  useEffect(() => {
    if (!hydrated) return;
    safeStorageSet(
      storageKey,
      JSON.stringify({ duration, remaining, running })
    );
  }, [hydrated, storageKey, duration, remaining, running]);
  useEffect(() => {
    if (!hydrated) return;
    const previous = previousRemaining.current;
    if (previous > 0 && remaining === 0) {
      ringAlarm("انتهت جلسة المذاكرة", "classic", completionAlertIdRef.current);
    }
    previousRemaining.current = remaining;
  }, [hydrated, remaining]);

  const { minutes, seconds } = formatStudyTime(remaining);
  const progress = duration
    ? ((duration * 60 - remaining) / (duration * 60)) * 100
    : 0;

  const reset = () => {
    completionAlertIdRef.current = uid();
    setRunning(false);
    setRemaining(duration * 60);
  };

  const changeDuration = event => {
    const next = clampStudyDuration(Number(event.target.value));
    completionAlertIdRef.current = uid();
    setDuration(next);
    setRemaining(next * 60);
    setRunning(false);
  };

  return (
    <section
      className={`studyTimerCard ${expanded ? "is-expanded" : "is-collapsed"}`}
      style={{ ...styles.reminderCard, marginTop: 16, overflow: "hidden" }}
      aria-label="مؤقت جلسة مذاكرة"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          cursor: "pointer",
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        onKeyDown={event => event.key === "Enter" && setExpanded(value => !value)}
        title={expanded ? "إخفاء تفاصيل المؤقت" : "فتح تفاصيل المؤقت"}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: COLORS.gold,
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            <Clock3 size={18} /> مؤقت جلسة مذاكرة
          </div>
          <div style={{ display: expanded ? "block" : "none", color: COLORS.muted, fontSize: 11, marginTop: 5 }}>
            ركّز في جلسة واحدة، وخلي كل دقيقة تقرّبك من هدفك.
          </div>
        </div>
        <label
          onClick={event => event.stopPropagation()}
          style={{
            display: expanded ? "flex" : "none",
            alignItems: "center",
            gap: 6,
            color: COLORS.muted,
            fontSize: 11,
          }}
        >
          المدة
          <input
            aria-label="مدة جلسة المذاكرة بالدقائق"
            type="number"
            min="5"
            max="180"
            value={duration}
            onChange={changeDuration}
            disabled={running}
            style={{ ...styles.smallInput, width: 64, textAlign: "center" }}
          />
          د
        </label>
        <span style={{ color: COLORS.gold, fontSize: 16 }}>{expanded ? "⌃" : "⌄"}</span>
      </div>
      <div className="studyTimerDetails" style={{ display: expanded ? "block" : "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          margin: "18px 0 14px",
        }}
      >
        <div
          style={{
            fontSize: 46,
            fontWeight: 950,
            letterSpacing: 2,
            color: remaining === 0 ? COLORS.teal : COLORS.ink,
            direction: "ltr",
          }}
        >
          {minutes}:{seconds}
        </div>
        <div
          style={{
            color: remaining === 0 ? COLORS.teal : COLORS.gold,
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {remaining === 0
            ? "اكتملت الجلسة"
            : running
              ? "جلسة جارية"
              : "جاهز للبدء"}
        </div>
      </div>
      <div
        style={{
          height: 7,
          background: `${COLORS.gold}22`,
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, progress)}%`,
            background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.teal})`,
            transition: "width .25s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          type="button"
          style={{
            ...styles.primaryBtn,
            flex: 1,
            background: "#2563EB",
            color: "#FFFFFF",
          }}
          onClick={() => {
            if (running) {
              setRunning(false);
              return;
            }
            primeAlarmAudio();
            if (remaining === 0) {
              completionAlertIdRef.current = uid();
              setRemaining(duration * 60);
            }
            setRunning(true);
          }}
        >
          {running
            ? "إيقاف مؤقت"
            : remaining === 0
              ? "بدء جلسة جديدة"
              : "ابدأ الجلسة"}
        </button>
        <button type="button" style={styles.ghostBtn} onClick={reset}>
          إعادة ضبط
        </button>
      </div>
      </div>
    </section>
  );
}

function DomainAllocationTimer({ domainId, domainName, trackId, hours, data, persist, isAuthenticated, userId = null }) {
  const totalSeconds = Math.max(0, Math.round(Number(hours || 0) * 3600));
  const storageKey = scopedStorageKey(`domain-allocation-timer:${domainId}`, userId);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState(0);
  const [studiedSeconds, setStudiedSeconds] = useState(0);
  const [studiedBaseSeconds, setStudiedBaseSeconds] = useState(0);
  const [segmentStartRemaining, setSegmentStartRemaining] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [sessionBaseSeconds, setSessionBaseSeconds] = useState(0);
  const [hydratedStorageKey, setHydratedStorageKey] = useState(null);
  const hydrated = hydratedStorageKey === storageKey;
  const dataRef = useRef(data);
  const lastSessionSyncAt = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const saveSession = useCallback(session => {
    const current = dataRef.current;
    if (!current) return;
    const history = Array.isArray(current.meta?.studySessions)
      ? current.meta.studySessions
      : [];
    const next = {
      ...current,
      meta: {
        ...(current.meta || {}),
        studySessions: [session, ...history.filter(item => item.id !== session.id)]
          .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
          .slice(0, 500),
      },
    };
    dataRef.current = next;
    persist(next);
  }, [persist]);
  const persistSession = (id, startedAt, durationSeconds, status, savedEndAt = 0) => {
    if (!id) return;
    const timestamp = new Date().toISOString();
    saveSession({
      id,
      domainId,
      domainName,
      trackId,
      startedAt: startedAt || timestamp,
      updatedAt: timestamp,
      durationSeconds: Math.max(0, Math.floor(durationSeconds || 0)),
      status,
      endAt: savedEndAt,
    });
  };

  useEffect(() => {
    setHydratedStorageKey(null);
    setRemaining(totalSeconds);
    setRunning(false);
    setEndAt(0);
    setStudiedSeconds(0);
    setStudiedBaseSeconds(0);
    setSegmentStartRemaining(0);
    setSessionId(null);
    setSessionStartedAt(null);
    setSessionBaseSeconds(0);
    try {
      const saved = JSON.parse(safeStorageGet(storageKey) || "null");
      if (saved && Number.isFinite(saved.remaining)) {
        const savedRunning = Boolean(saved.running) && Number(saved.endAt) > 0;
        const nextRemaining = savedRunning
          ? Math.max(0, Math.ceil((Number(saved.endAt) - Date.now()) / 1000))
          : Math.max(0, Math.floor(saved.remaining));
        if (savedRunning && nextRemaining === 0) {
          ringAlarm(
            `انتهى مؤقت ${domainName || "المجال"}`,
            "loud",
            `domain-timer-${domainId}-${saved.sessionId || saved.endAt}`,
          );
        }
        const hasTrackedSegment =
          Number.isFinite(saved.studiedBaseSeconds) &&
          Number.isFinite(saved.segmentStartRemaining);
        const accruedWhileRunning = savedRunning
          ? hasTrackedSegment
            ? Math.max(
                0,
                Math.floor(saved.studiedBaseSeconds) +
                  Math.max(0, Math.floor(saved.segmentStartRemaining) - nextRemaining)
              )
            : Math.max(0, totalSeconds - nextRemaining)
          : 0;
        const restoredStudied = savedRunning
          ? Math.max(Number(saved.studiedSeconds) || 0, accruedWhileRunning)
          : Math.max(0, Math.floor(Number(saved.studiedSeconds) || 0));
        setRemaining(nextRemaining);
        setRunning(savedRunning && nextRemaining > 0);
        setEndAt(savedRunning && nextRemaining > 0 ? Number(saved.endAt) : 0);
        setStudiedSeconds(restoredStudied);
        setStudiedBaseSeconds(
          Number.isFinite(saved.studiedBaseSeconds)
            ? Math.max(0, Math.floor(saved.studiedBaseSeconds))
            : restoredStudied
        );
        setSegmentStartRemaining(
          savedRunning && nextRemaining > 0
            ? Number.isFinite(saved.segmentStartRemaining)
              ? Math.max(0, Math.floor(saved.segmentStartRemaining))
              : nextRemaining
            : 0
        );
        const restoredSessionId = saved.sessionId ||
          (savedRunning ? `legacy-${domainId}-${Date.now()}` : null);
        setSessionId(restoredSessionId);
        setSessionStartedAt(
          saved.sessionStartedAt ||
            (savedRunning
              ? new Date(Date.now() - Math.max(0, totalSeconds - nextRemaining) * 1000).toISOString()
              : null)
        );
        setSessionBaseSeconds(Math.max(0, Math.floor(Number(saved.sessionBaseSeconds) || 0)));
      }
    } catch {
      // Start with the allocated duration when saved timer state is unavailable.
    }
    setHydratedStorageKey(storageKey);
  }, [storageKey, totalSeconds, domainId]);

  useEffect(() => {
    if (!hydrated || !running || !endAt) return undefined;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      const nextStudied =
        studiedBaseSeconds + Math.max(0, segmentStartRemaining - next);
      setRemaining(next);
      setStudiedSeconds(nextStudied);
      const sessionDuration =
        sessionBaseSeconds + Math.max(0, segmentStartRemaining - next);
      const now = Date.now();
      if (sessionId && (now - lastSessionSyncAt.current >= 15000 || next === 0)) {
        saveSession({
          id: sessionId,
          domainId,
          domainName,
          trackId,
          startedAt: sessionStartedAt || new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          durationSeconds: sessionDuration,
          status: next === 0 ? "completed" : "running",
          endAt: next === 0 ? 0 : endAt,
        });
        lastSessionSyncAt.current = now;
      }
      if (next === 0) {
        ringAlarm(
          `انتهى مؤقت ${domainName || "المجال"}`,
          "loud",
          `domain-timer-${domainId}-${sessionId || endAt}`,
        );
        setStudiedBaseSeconds(nextStudied);
        setSegmentStartRemaining(0);
        setSessionId(null);
        setSessionStartedAt(null);
        setSessionBaseSeconds(0);
        setRunning(false);
        setEndAt(0);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [hydrated, running, endAt, studiedBaseSeconds, segmentStartRemaining, sessionBaseSeconds, sessionId, sessionStartedAt, domainId, domainName, trackId, saveSession]);

  useEffect(() => {
    if (!hydrated) return;
    safeStorageSet(
      storageKey,
      JSON.stringify({
        remaining,
        running,
        endAt,
        studiedSeconds,
        studiedBaseSeconds,
        segmentStartRemaining,
        sessionId,
        sessionStartedAt,
        sessionBaseSeconds,
      })
    );
  }, [hydrated, storageKey, remaining, running, endAt, studiedSeconds, studiedBaseSeconds, segmentStartRemaining, sessionId, sessionStartedAt, sessionBaseSeconds]);

  const startOrPause = () => {
    if (running) {
      const nextRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      const nextStudied =
        studiedBaseSeconds + Math.max(0, segmentStartRemaining - nextRemaining);
      const nextSessionDuration =
        sessionBaseSeconds + Math.max(0, segmentStartRemaining - nextRemaining);
      persistSession(sessionId, sessionStartedAt, nextSessionDuration, "paused");
      setRemaining(nextRemaining);
      setStudiedSeconds(nextStudied);
      setStudiedBaseSeconds(nextStudied);
      setSessionBaseSeconds(nextSessionDuration);
      setSegmentStartRemaining(0);
      setRunning(false);
      setEndAt(0);
      return;
    }
    if (totalSeconds <= 0) return;
    const next = remaining > 0 ? remaining : totalSeconds;
    const nextSessionId = sessionId || uid();
    const nextSessionStartedAt = sessionStartedAt || new Date().toISOString();
    const nextSessionBase = sessionId ? sessionBaseSeconds : 0;
    const nextEndAt = Date.now() + next * 1000;
    setSessionId(nextSessionId);
    setSessionStartedAt(nextSessionStartedAt);
    setSessionBaseSeconds(nextSessionBase);
    setStudiedBaseSeconds(studiedSeconds);
    setSegmentStartRemaining(next);
    setRemaining(next);
    setEndAt(nextEndAt);
    primeAlarmAudio();
    setRunning(true);
    persistSession(nextSessionId, nextSessionStartedAt, nextSessionBase, "running", nextEndAt);
  };
  const reset = () => {
    const nextRemaining = running && endAt
      ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      : remaining;
    const nextStudied = running
      ? studiedBaseSeconds + Math.max(0, segmentStartRemaining - nextRemaining)
      : studiedSeconds;
    const nextSessionDuration = running
      ? sessionBaseSeconds + Math.max(0, segmentStartRemaining - nextRemaining)
      : sessionBaseSeconds;
    persistSession(sessionId, sessionStartedAt, nextSessionDuration, "stopped");
    setRunning(false);
    setEndAt(0);
    setStudiedSeconds(nextStudied);
    setStudiedBaseSeconds(nextStudied);
    setSegmentStartRemaining(0);
    setSessionId(null);
    setSessionStartedAt(null);
    setSessionBaseSeconds(0);
    setRemaining(totalSeconds);
  };
  const hoursLeft = Math.floor(remaining / 3600);
  const minutesLeft = Math.floor((remaining % 3600) / 60);
  const secondsLeft = remaining % 60;
  const format = value => String(value).padStart(2, "0");
  const progress = totalSeconds ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;
  const recentSessions = (data?.meta?.studySessions || [])
    .filter(session => session.domainId === domainId)
    .slice(0, 5);
  const formatSessionDuration = seconds => {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    if (h && m) return `${h} س ${m} د`;
    if (h) return `${h} س`;
    if (m) return `${m} د`;
    return "أقل من دقيقة";
  };
  const sessionStatusLabel = status => ({
    running: "جارية",
    paused: "متوقفة مؤقتًا",
    completed: "مكتملة",
    stopped: "متوقفة",
  }[status] || "مسجلة");

  return (
    <section
      aria-label={`مؤقت مجال ${domainName}`}
      style={{
        marginBottom: 14,
        padding: 13,
        borderRadius: 12,
        border: `1px solid ${COLORS.teal}55`,
        background: `${COLORS.teal}0C`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <strong style={{ color: COLORS.teal, fontSize: 12 }}>وقت المجال المحدد</strong>
          <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 3 }}>
            {hours || 0} ساعة · {domainName}
          </div>
        </div>
        <div
          role="timer"
          aria-live="off"
          style={{ color: remaining === 0 ? COLORS.gold : COLORS.text, fontSize: 22, fontWeight: 900, direction: "ltr" }}
        >
          {format(hoursLeft)}:{format(minutesLeft)}:{format(secondsLeft)}
        </div>
      </div>
      <div style={{ height: 5, background: `${COLORS.teal}22`, borderRadius: 99, overflow: "hidden", marginTop: 10 }}>
        <div style={{ height: "100%", width: `${Math.min(100, progress)}%`, background: COLORS.teal, transition: "width .3s ease" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={startOrPause}
          disabled={totalSeconds <= 0}
          style={{ ...styles.primaryBtn, flex: 1, background: "#2563EB", color: "#FFFFFF" }}
        >
          {running ? "إيقاف المؤقت" : remaining === 0 ? "ابدأ من جديد" : "ابدأ"}
        </button>
        <button type="button" onClick={reset} style={styles.ghostBtn} disabled={totalSeconds <= 0}>
          إعادة ضبط
        </button>
      </div>
      {totalSeconds <= 0 && (
        <small style={{ display: "block", marginTop: 8, color: COLORS.textDim }}>
          لم تُحدد ساعات لهذا المجال في الخطة السنوية.
        </small>
      )}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <strong style={{ color: COLORS.text, fontSize: 11 }}>سجل جلسات المذاكرة</strong>
          <small style={{ color: COLORS.textDim, fontSize: 9 }}>{isAuthenticated ? "محفوظ في حسابك" : "محفوظ على هذا الجهاز"}</small>
        </div>
        {recentSessions.length ? (
          <div style={{ display: "grid", gap: 5 }}>
            {recentSessions.map(session => (
              <div key={session.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: COLORS.textDim, fontSize: 10, padding: "5px 7px", borderRadius: 7, background: `${COLORS.surface2}88` }}>
                <span>{new Date(session.startedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{formatSessionDuration(session.durationSeconds)}</span>
                <span style={{ color: session.status === "completed" ? COLORS.teal : COLORS.textDim }}>{sessionStatusLabel(session.status)}</span>
              </div>
            ))}
          </div>
        ) : (
          <small style={{ color: COLORS.textDim, fontSize: 10 }}>ستظهر هنا الجلسات بعد بدء المذاكرة.</small>
        )}
      </div>
    </section>
  );
}

function AnnualDomainProgress({ domainId, domainName, goalHours, studySessions = [], userId = null }) {
  const storageKey = scopedStorageKey(`domain-allocation-timer:${domainId}`, userId);
  const goalSeconds = Math.max(0, Number(goalHours || 0) * 3600);
  const [studiedSeconds, setStudiedSeconds] = useState(0);

  useEffect(() => {
    const refresh = () => {
      try {
        const saved = JSON.parse(safeStorageGet(storageKey) || "null");
        if (!saved) {
          setStudiedSeconds(0);
          return;
        }
        const running = Boolean(saved.running) && Number(saved.endAt) > Date.now();
        const remaining = running
          ? Math.max(0, Math.ceil((Number(saved.endAt) - Date.now()) / 1000))
          : Math.max(0, Math.floor(Number(saved.remaining) || 0));
        const hasTrackedSegment =
          Number.isFinite(saved.studiedBaseSeconds) &&
          Number.isFinite(saved.segmentStartRemaining);
        const accruedWhileRunning = running
          ? hasTrackedSegment
            ? Math.max(
                0,
                Math.floor(saved.studiedBaseSeconds) +
                  Math.max(0, Math.floor(saved.segmentStartRemaining) - remaining)
              )
            : Math.max(0, goalSeconds - remaining)
          : 0;
        const savedStudied = Math.max(0, Math.floor(Number(saved.studiedSeconds) || 0));
        const nextStudied = running
          ? Math.max(savedStudied, accruedWhileRunning)
          : savedStudied;
        setStudiedSeconds(current => current === nextStudied ? current : nextStudied);
      } catch {
        setStudiedSeconds(0);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 1000);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", refresh);
    };
  }, [storageKey, goalSeconds]);

  const accountStudiedSeconds = totalStudiedSecondsForDomain(studySessions, domainId);
  const allStudiedSeconds = Math.max(studiedSeconds, accountStudiedSeconds);
  const progress = goalSeconds > 0
    ? Math.min(100, (allStudiedSeconds / goalSeconds) * 100)
    : 0;
  const studiedHours = allStudiedSeconds / 3600;
  const hoursLabel = value => value.toLocaleString("ar-EG", { maximumFractionDigits: 1 });

  return (
    <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: COLORS.textDim, fontSize: 10 }}>
        <span>ذاكرت {hoursLabel(studiedHours)} من {hoursLabel(Number(goalHours) || 0)} ساعة</span>
        <strong style={{ color: "#93C5FD" }}>{Math.round(progress)}٪</strong>
      </div>
      <div
        role="progressbar"
        aria-label={`تقدم مذاكرة مجال ${domainName}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        style={{ height: 8, borderRadius: 99, overflow: "hidden", border: "1px solid #2563EB44", background: "linear-gradient(90deg, #2563EB18, #60A5FA22)", boxShadow: "inset 0 0 7px #2563EB20" }}
      >
        <div
          style={{ width: `${progress}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #2563EB, #60A5FA)", boxShadow: "0 0 11px #3B82F6AA", transition: "width .5s ease" }}
        />
      </div>
    </div>
  );
}

function AIRecommendationsCard({ data }) {
  const recommendation = trpc.learningData.recommend.useMutation({
    onError: error =>
      notifyApp(error?.message || "تعذر إنشاء الاقتراحات الآن. حاول مرة أخرى.")
  });

  const requestRecommendations = () => {
    const stats = progressStats(data);
    const domains = (data.domains || []).slice(0, 12).map(domain => {
      const titles = (domain.subtopics || []).slice(0, 8).map(sub => ({
        title: String(sub.title || "عنوان بدون اسم").slice(0, 160),
        progress: Math.max(0, Math.min(100, Number(sub.progress) || (sub.completed ? 100 : 0))),
      }));
      const progress = titles.length
        ? Math.round(titles.reduce((sum, item) => sum + item.progress, 0) / titles.length)
        : 0;
      return {
        name: String(domain.name || "مجال غير مسمى").slice(0, 120),
        track: String(domain.track || "عام").slice(0, 60),
        progress,
        titles,
      };
    });
    const recentStudyHours = (data.meta?.studySessions || [])
      .slice(0, 7)
      .reduce((sum, session) =>
        sum + Number(session.durationSeconds || session.seconds || 0), 0) / 3600;

    recommendation.mutate({
      percent: stats.percent,
      totalTitles: data.domains?.reduce((sum, domain) => sum + (domain.subtopics || []).length, 0) || 0,
      completedTitles: data.domains?.reduce(
        (sum, domain) => sum + (domain.subtopics || []).filter(sub => Number(sub.progress || 0) >= 100 || sub.completed).length,
        0,
      ) || 0,
      recentStudyHours: Number(recentStudyHours.toFixed(2)),
      domains,
    });
  };

  const result = recommendation.data;

  return (
    <section
      className="welcomeCard"
      style={{ ...styles.welcomeCard, marginTop: 22, borderColor: `${COLORS.teal}55` }}
      aria-label="اقتراحات التعلم بالذكاء الاصطناعي"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, display: "grid", placeItems: "center", background: `${COLORS.teal}1f`, color: COLORS.teal }}>
            <Sparkles size={18} />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: 16 }}>مساعدك الذكي للتعلّم</strong>
            <small style={{ color: COLORS.textDim }}>اقتراحات خفيفة مبنية على تقدمك الحالي</small>
          </div>
        </div>
        <button
          type="button"
          onClick={requestRecommendations}
          disabled={recommendation.isPending}
          style={{ ...styles.primaryBtn, background: COLORS.teal, color: "#062A27", minWidth: 150, opacity: recommendation.isPending ? 0.65 : 1 }}
        >
          <Sparkles size={15} />
          {recommendation.isPending ? "جاري التحليل..." : "اقترح لي الآن"}
        </button>
      </div>

      {!result && !recommendation.isPending && (
        <p style={{ color: COLORS.textDim, fontSize: 12, lineHeight: 1.8, margin: "14px 0 0" }}>
          اضغط الزر للحصول على مجالات تركيز، موارد قابلة للبحث، وخطة أسبوعية قصيرة. لا يتم إرسال ملفاتك؛ يُرسل فقط ملخص التقدم وعناوين التعلم اللازمة للاقتراح.
        </p>
      )}

      {result && (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }} aria-live="polite">
          <p style={{ color: COLORS.text, fontSize: 13, lineHeight: 1.8, margin: 0 }}>{result.summary}</p>
          {result.focusAreas?.length > 0 && (
            <div>
              <strong style={{ fontSize: 13 }}>مجالات التركيز</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {result.focusAreas.slice(0, 3).map((item, index) => (
                  <div key={`${item.title}-${index}`} style={{ padding: "9px 11px", borderRadius: 10, background: `${COLORS.teal}0d`, border: `1px solid ${COLORS.teal}2b` }}>
                    <strong style={{ color: COLORS.teal, fontSize: 12 }}>{item.title}</strong>
                    <div style={{ color: COLORS.textDim, fontSize: 11, lineHeight: 1.7, marginTop: 3 }}>{item.reason} — {item.action}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.resources?.length > 0 && (
            <div>
              <strong style={{ fontSize: 13 }}>موارد للبحث</strong>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {result.resources.slice(0, 4).map((item, index) => (
                  <div key={`${item.title}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${COLORS.border}` }}>
                    <div>
                      <strong style={{ display: "block", fontSize: 12 }}>{item.title}</strong>
                      <small style={{ color: COLORS.textDim }}>{item.type} · {item.why}</small>
                    </div>
                    <code style={{ color: COLORS.gold, fontSize: 10, maxWidth: 180, textAlign: "end" }}>{item.searchQuery}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.weekPlan?.length > 0 && (
            <div>
              <strong style={{ fontSize: 13 }}>خطة الأيام السبعة</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
                {result.weekPlan.slice(0, 7).map((item, index) => (
                  <div key={`${item.day}-${index}`} style={{ padding: 9, borderRadius: 10, background: COLORS.surface2 }}>
                    <strong style={{ display: "block", color: COLORS.gold, fontSize: 11 }}>{item.day} · {item.minutes} دقيقة</strong>
                    <span style={{ display: "block", fontSize: 11, marginTop: 4 }}>{item.focus}</span>
                    <small style={{ color: COLORS.textDim, lineHeight: 1.6 }}>{item.task}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}


function DailyCheckIn({ data, goto, onOpenPlan }) {
  const [choice, setChoice] = useState(null);
  const domains = data.domains || [];
  const allTitles = domains.flatMap(domain => (domain.subtopics || []).map(sub => ({ domain, sub })));
  const nextTitle = allTitles.find(({ sub }) => !sub.completed);
  const overdueCount = (data.meta.planItems?.daily || []).filter(item =>
    item && item.date && item.date < todayISO() && !isPlanItemComplete(item)
  ).length;
  const stats = progressStats(data);
  const choices = [
    { key: 'quick', label: 'أريد إنجازًا سريعًا', hint: 'خطوة واحدة في 15 دقيقة', icon: '✦' },
    { key: 'focus', label: 'أريد جلسة تركيز', hint: 'نحوّل وقتك إلى جلسة واضحة', icon: '◷' },
    { key: 'review', label: 'أريد مراجعة المتأخرات', hint: overdueCount ? `${overdueCount} مهمة تنتظر اهتمامك` : 'نراجع ما يحتاج تثبيتًا', icon: '↻' },
  ];
  const openChoice = key => {
    setChoice(key);
    if (key === 'quick' && nextTitle) {
      goto({ screen: 'domains', track: nextTitle.domain.track, domainId: nextTitle.domain.id, subtopicId: nextTitle.sub.id });
    } else if (key === 'focus') {
      onOpenPlan?.();
    } else if (key === 'review') {
      goto({ screen: 'progress', domainId: null, subtopicId: null });
    }
  };
  const journey = [
    { label: 'بدأت', done: allTitles.length > 0 },
    { label: 'تتقدم', done: stats.percent >= 25 },
    { label: 'تحتاج مراجعة', done: overdueCount > 0 },
    { label: 'أتقنت', done: stats.percent >= 100 },
  ];
  return (
    <section className="humanCheckin" aria-label="اختيار جلسة التعلم اليوم">
      <div className="humanCheckinHead">
        <div>
          <span className="humanCheckinEyebrow">مساحتك اليوم</span>
          <h2>ماذا تحتاج اليوم؟</h2>
          <p>{stats.percent >= 70 ? 'أنت قطعت شوطًا جميلًا. نكمل بخطوة خفيفة؟' : 'اختر ما يناسب طاقتك الآن، وسأرتب لك البداية.'}</p>
        </div>
        <div className="journeyLine" aria-label={`رحلة التعلم ${stats.percent}%`}>
          {journey.map((step, index) => <div key={step.label} className={step.done ? 'journeyStep isDone' : 'journeyStep'}><span>{step.done ? '✓' : index + 1}</span><small>{step.label}</small></div>)}
        </div>
      </div>
      <div className="humanChoiceGrid">
        {choices.map(item => <button key={item.key} type="button" className={choice === item.key ? 'humanChoice isSelected' : 'humanChoice'} onClick={() => openChoice(item.key)}>
          <span className="humanChoiceIcon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span><span className="humanChoiceArrow">←</span>
        </button>)}
      </div>
      {choice && <div className="humanPlanNote" role="status">{choice === 'quick' ? (nextTitle ? `نبدأ بـ «${nextTitle.sub.title}»، وبعدها لك حرية التوقف أو الاستمرار.` : 'كل العناوين الحالية منجزة. خذ لحظة للاحتفال ثم أضف خطوة جديدة.') : choice === 'focus' ? 'جهّزت لك مساحة الخطة. اختر مدة تناسب يومك، ولا تحتاج أن تنجز كل شيء دفعة واحدة.' : overdueCount ? `سنبدأ بأقرب مهمة متأخرة، واحدة فقط في كل مرة.` : 'لا توجد متأخرات حاليًا؛ وقت ممتاز لتثبيت ما تعلمته.'}</div>}
    </section>
  );
}

function getLearningStreak(data) {
  const history = Array.isArray(data?.meta?.progressHistory) ? data.meta.progressHistory : [];
  const activeDays = new Set(history.filter(item => Number(item.completed) > 0).map(item => item.date));
  let streak = 0;
  const cursor = new Date(`${todayISO()}T12:00:00`);
  while (activeDays.has(formatLocalCalendarDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function DailyMomentumPanel({ data, persist, goto }) {
  const today = todayISO();
  const stats = progressStats(data);
  const streak = getLearningStreak(data);
  const momentum = data.meta.dailyMomentum || {};
  const challengeDone = momentum.date === today && momentum.challengeDone === true;
  const nextTitle = data.domains.flatMap(domain => domain.subtopics.map(sub => ({ domain, sub }))).find(item => !item.sub.completed);
  const challenge = stats.total === 0
    ? { label: "أضف أول عنوان", hint: "خطوة واحدة تفتح لك مسارًا واضحًا." }
    : stats.percent < 35
      ? { label: "أنجز خطوة واحدة من خطتك", hint: "لا تحتاج أكثر من 15 دقيقة لتبدأ." }
      : { label: "راجع ما تعلمته اليوم", hint: "المراجعة الصغيرة تثبّت التقدم." };

  const record = (kind, message) => {
    const nextActivity = [{ id: uid(), kind, message, at: new Date().toISOString() }, ...(data.meta.activityLog || [])].slice(0, 30);
    const achievements = new Set(data.meta.achievements || []);
    achievements.add("first-choice");
    if (streak >= 3) achievements.add("three-day-streak");
    if (kind === "challenge") achievements.add("daily-challenge");
    persist({ ...data, meta: { ...data.meta, dailyMomentum: { date: today, challengeDone: kind === "challenge" ? true : challengeDone }, activityLog: nextActivity, achievements: [...achievements] } });
  };

  const startQuickSession = () => {
    record("session", "بدأت جلسة اليوم");
    goto({ screen: "time", domainId: null, subtopicId: null });
  };
  const continueLearning = () => {
    if (nextTitle) {
      record("lesson", `فتحت ${nextTitle.sub.title}`);
      goto({ screen: "lesson", track: nextTitle.domain.track, domainId: nextTitle.domain.id, subtopicId: nextTitle.sub.id });
    } else startQuickSession();
  };

  return (
    <section className="dailyMomentumPanel" aria-label="نشاطك اليوم">
      <div className="dailyMomentumHeader">
        <div><span className="dailyMomentumEyebrow"><Sparkles size={13} /> اقتراح مناسب لحالتك</span><h3>ابدأ بخطوة تشبه وقتك اليوم</h3></div>
        <button type="button" className="achievementsLink" onClick={() => goto({ screen: "achievements", domainId: null, subtopicId: null })}><Trophy size={14} /> إنجازاتي</button>
      </div>
      <div className="dailyMomentumActions">
        <button type="button" onClick={startQuickSession}><PlayCircle size={18} /><strong>ابدأ جلسة اليوم</strong><small>15 دقيقة تكفي</small></button>
        <button type="button" onClick={continueLearning}><Route size={18} /><strong>{nextTitle ? "أكمل من حيث توقفت" : "ابدأ مسارك"}</strong><small>{nextTitle?.sub.title || "اختر عنوانًا"}</small></button>
        <button type="button" onClick={() => { record("review", "فتحت المراجعة"); goto({ screen: "progress", domainId: null, subtopicId: null }); }}><RotateCcw size={18} /><strong>راجع آخر تقدم</strong><small>نظرة هادئة على رحلتك</small></button>
      </div>
      <div className="dailyMomentumBottom">
        <div className="challengeCard"><span className="challengeBadge">تحدي اليوم</span><strong>{challenge.label}</strong><small>{challenge.hint}</small><button type="button" disabled={challengeDone} onClick={() => record("challenge", "أنجزت تحدي اليوم")}>{challengeDone ? "✓ أنجزتها" : "أنجزتها"}</button></div>
        <div className="streakCard"><Flame size={22} /><strong>{streak}</strong><span>أيام متتالية</span><small>{streak ? "استمرار هادئ يصنع فرقًا." : "ابدأ اليوم بسطر واحد."}</small></div>
      </div>
      <div className="activityStrip"><span><Clock3 size={13} /> آخر نشاط</span><strong>{data.meta.activityLog?.[0]?.message || "لم تسجل نشاطًا بعد — أول خطوة لك."}</strong><small>{data.meta.activityLog?.[0] ? "منذ قليل" : "ابدأ من أحد الاختيارات بالأعلى"}</small></div>
    </section>
  );
}

function AchievementsScreen({ data, goto }) {
  const achievements = new Set(data.meta.achievements || []);
  const cards = [
    ["first-choice", "أول قرار", "اخترت طريقة مناسبة لتبدأ يومك.", Sparkles],
    ["daily-challenge", "تحدي اليوم", "أنجزت تحديًا قصيرًا يساعدك على الاستمرار.", Target],
    ["three-day-streak", "ثلاثة أيام", "حافظت على حضورك ثلاث مرات متتالية.", Flame],
    ["first-title", "أول عنوان", "أنهيت أول عنوان في رحلتك.", Trophy],
  ];
  return <div style={styles.page} className="achievementsPage"><button type="button" style={styles.backRow} onClick={() => goto({ screen: "dashboard", domainId: null, subtopicId: null })}><ChevronRight size={18} /> الرئيسية</button><section className="achievementsHero"><Trophy size={28} /><div><span>إنجازاتك الشخصية</span><h1>كل خطوة لها أثر</h1><p>لا نقيسك بالسرعة؛ نحتفل بأنك عدت وأكملت.</p></div></section><div className="achievementGrid">{cards.map(([id, title, text, Icon]) => <article key={id} className={`achievementCard ${achievements.has(id) ? "is-earned" : ""}`}><Icon size={22} /><strong>{title}</strong><p>{text}</p><small>{achievements.has(id) ? "✓ مكتمل" : "قريبًا مع خطوتك القادمة"}</small></article>)}</div></div>;
}

function Dashboard({ data, persist, goto, onOpenSearch, settings, onOpenPlan, uploadAsset, user }) {
  const dueItems = [];
  const [reviewFilter, setReviewFilter] = useState("all");
  const [overdueNotice, setOverdueNotice] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  data.domains.forEach(domain => {
    domain.subtopics.forEach(sub => {
      if (!isTitleTaskComplete(data, domain, sub)) return;
      const reviewStart = sub.dateStarted || todayISO();
      REVIEW_STAGES.forEach((stage, i) => {
        if (sub.reviewDone[i]) return;
        const dueDate = addDays(reviewStart, stage.days);
        if (diffDaysFromToday(dueDate) >= 0) {
          dueItems.push({
            domain,
            sub,
            stageIndex: i,
            stage,
            dueDate,
            overdue: diffDaysFromToday(dueDate) > 0,
          });
        }
      });
    });
  });
  dueItems.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const overdueCount = dueItems.filter(item => item.overdue).length;
  const visibleDueItems = dueItems.filter(item =>
    reviewFilter === "overdue"
      ? item.overdue
      : reviewFilter === "today"
        ? !item.overdue
        : true
  );
  const dashboardStats = progressStats(data);
  const assistantContext = buildAssistantContext(data);
  const dashboardTitleCount = data.domains.reduce(
    (total, domain) => total + (domain.subtopics || []).length,
    0
  );
  const currentWeekStart = getCalendarWeekStart(new Date(`${todayISO()}T12:00:00`));
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
  const currentWeekStartKey = formatLocalCalendarDate(currentWeekStart);
  const currentWeekEndKey = formatLocalCalendarDate(currentWeekEnd);
  const activeWeekTasks = (data.meta.weekTasks || []).filter(task => {
    const taskDate = getWeekTaskDate(task) || task.plannedDate || "";
    return taskDate >= currentWeekStartKey && taskDate <= currentWeekEndKey;
  });
  const activeWeekLinks = activeWeekTasks
    .map(task => getScheduledTitleLink(data, task))
    .filter(Boolean);
  const activeWeekDomainIds = new Set(activeWeekLinks.map(link => link.domain.id));
  const activeWeekTitleIds = new Set(activeWeekLinks.map(link => `${link.domain.id}:${link.subtopic.id}`));
  const activeWeekDomains = data.domains
    .filter(domain => activeWeekDomainIds.has(domain.id))
    .map(domain => ({
      ...domain,
      subtopics: domain.subtopics.filter(sub => activeWeekTitleIds.has(`${domain.id}:${sub.id}`)),
    }));
  const activeWeekTitleCount = activeWeekDomains.reduce((total, domain) => total + domain.subtopics.length, 0);

  useEffect(() => {
    if (!settings?.reviewSound || dueItems.length === 0) return;
    const key = `review-sound-${todayISO()}`;
    if (safeStorageGet(key) === "played") return;
    playReviewTone(settings.reviewTone);
    safeStorageSet(key, "played");
  }, [settings?.reviewSound, dueItems.length]);

  const markDone = (domainId, subId, stageIndex) => {
    const next = {
      ...data,
      domains: data.domains.map(d =>
        d.id !== domainId
          ? d
          : {
              ...d,
              subtopics: d.subtopics.map(s =>
                s.id !== subId
                  ? s
                  : {
                      ...s,
                      reviewDone: s.reviewDone.map((v, i) =>
                        i === stageIndex ? true : v
                      ),
                    }
              ),
            }
      ),
    };
    const stats = progressStats(next);
    next.meta = {
      ...data.meta,
      progressHistory: [
        ...(data.meta.progressHistory || []),
        {
          date: todayISO(),
          value: stats.percent,
          completed: stats.completed,
          total: stats.total,
        },
      ].slice(-90),
    };
    persist(next);
  };

  return (
    <div className="dashboardPage" style={styles.page}>
      <section className="learningHeroBanner" aria-label="مساحة التعلم الذاتية">
        <div className="learningHeroContent">
          <span className="learningHeroEyebrow">خطوة ثابتة تصنع فرقًا</span>
          <h1>مساحتك للتعلّم تبدأ من هنا</h1>
          <p>خطّط لمسارك، تابع ساعات مذاكرتك، وحوّل أهدافك الكبيرة إلى إنجاز يومي واضح.</p>
          <div className="learningHeroKpis" aria-label="ملخص تقدمك">
            <div><strong>{dashboardStats.percent}%</strong><span>نسبة الإنجاز</span></div>
            <div><strong>{activeWeekDomains.length}</strong><span>مجالات نشطة هذا الأسبوع</span></div>
            <div><strong>{activeWeekTitleCount}</strong><span>عناوين هذا الأسبوع</span></div>
          </div>
          <div className="learningHeroActions">
            <button
              className="heroPrimary"
              onClick={() => goto({ screen: "planWorkspace", planKey: "weekly", domainId: null, subtopicId: null })}
            >
              افتح خطتك الأسبوعية <ChevronLeft size={16} />
            </button>
            <button
              className="heroSecondary"
              onClick={() => goto({ screen: "progress", domainId: null, subtopicId: null })}
            >
              عرض لوحة التقدم <BarChart3 size={16} />
            </button>
          </div>
        </div>
        <div className="learningHeroMark" aria-hidden="true">
          <div className="learningHeroOrb"><BookOpen size={31} /></div>
          <strong>تعلّم · طبّق · تقدّم</strong>
          <span>رحلتك اليومية تبدأ بخطوة</span>
        </div>
      </section>
      <div className="dashboardSectionTitle">
        <span>01</span>
        <div><strong>اختار اتجاه يومك</strong><small>قرار واحد صغير يكفي لتبدأ</small></div>
      </div>
      <div className="dashboardDaily"><DailyCheckIn data={data} goto={goto} onOpenPlan={onOpenPlan} /></div>
      <DailyMomentumPanel data={data} persist={persist} goto={goto} />
      <div className="dashboardSectionTitle">
        <span>02</span>
        <div><strong>خطتك الآن</strong><small>جلسة واضحة وتقدم تقدر تلاحظه</small></div>
      </div>
      <div className="dashboardControlColumns">
        <div className="dashboardControlMain">
          <InteractiveInsights data={data} persist={persist} goto={goto} onOpenSearch={onOpenSearch} userId={user?.id} />
          <React.Suspense fallback={<div style={{ ...styles.emptyCard, marginTop: 14 }}>جارٍ تجهيز رفيقك الذكي…</div>}>
            <PersonalAssistant context={assistantContext} data={data} persist={persist} uploadAsset={uploadAsset} user={user} />
          </React.Suspense>
        </div>
        <aside className="dashboardThirdColumn" aria-label="المتابعة اليومية والمراجعات">
          <DailySuccessQuote />
          <DailyPlanSpotlight data={data} persist={persist} goto={goto} />
        </aside>
      </div>
      <div className="dashboardSectionTitle">
        <span>03</span>
        <div><strong>تابع ما يحتاج انتباهك</strong><small>مراجعة هادئة بدون زحمة</small></div>
      </div>
      <div className="dashboardReviewRow">
      <section className="dashboardReview" style={{ marginTop: 22 }}>
        <button type="button" onClick={() => setReviewOpen(value => !value)} aria-expanded={reviewOpen} style={{ width: "100%", border: 0, background: "transparent", padding: "8px 0", color: COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "start" }}>
          <Bell size={18} color={COLORS.gold} />
          <span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 16 }}>لوحة المراجعة</strong>{reviewOpen && <small style={{ color: COLORS.textDim }}>{dueItems.length ? `${dueItems.length} عنصر بحاجة لمراجعة` : "لا توجد مراجعات مستحقة اليوم"}</small>}</span>
          <span style={{ color: COLORS.gold, fontSize: 16 }}>{reviewOpen ? "⌃" : "⌄"}</span>
        </button>
        {reviewOpen && (
          <div>
        {overdueCount > 0 && overdueNotice && (
          <div className="overdueBanner" style={styles.overdueBanner}>
            <div>
              <strong>تنبيه مراجعة متأخرة</strong>
              <span>لديك {overdueCount} مراجعة متأخرة — ابدأ بها الآن.</span>
            </div>
            <button
              style={styles.overdueDismiss}
              onClick={() => setOverdueNotice(false)}
              aria-label="إغلاق التنبيه"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div style={styles.reviewFilterBar}>
          <button
            style={{
              ...styles.reviewFilterBtn,
              ...(reviewFilter === "all" ? styles.reviewFilterActive : {}),
            }}
            onClick={() => setReviewFilter("all")}
          >
            الكل ({dueItems.length})
          </button>
          <button
            style={{
              ...styles.reviewFilterBtn,
              ...(reviewFilter === "today" ? styles.reviewFilterActive : {}),
            }}
            onClick={() => setReviewFilter("today")}
          >
            اليوم ({dueItems.length - overdueCount})
          </button>
          <button
            style={{
              ...styles.reviewFilterBtn,
              ...(reviewFilter === "overdue" ? styles.reviewFilterOverdue : {}),
            }}
            onClick={() => setReviewFilter("overdue")}
          >
            المتأخرة ({overdueCount})
          </button>
        </div>
        {visibleDueItems.length === 0 ? (
          <div style={styles.emptyCard}>
            كل عناوينك محدّثة — استمر في الإضافة والتعلم.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleDueItems.slice(0, 12).map(item => {
              const track = TRACKS.find(t => t.id === item.domain.track);
              const Icon = track.icon;
              return (
                <div
                  key={item.domain.id + item.sub.id + item.stageIndex}
                  style={styles.reviewRow}
                >
                  <div
                    style={{
                      ...styles.reviewIconWrap,
                      background: track.bg,
                      color: track.accent,
                    }}
                    onClick={() =>
                      goto({
                        screen: "lesson",
                        track: track.id,
                        domainId: item.domain.id,
                        subtopicId: item.sub.id,
                      })
                    }
                  >
                    <Icon size={18} />
                  </div>
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    onClick={() =>
                      goto({
                        screen: "lesson",
                        track: track.id,
                        domainId: item.domain.id,
                        subtopicId: item.sub.id,
                      })
                    }
                  >
                    <div style={styles.reviewTitle}>{item.sub.title}</div>
                    <div style={styles.reviewMeta}>
                      {item.domain.name} · {item.stage.label}
                      {item.overdue ? (
                        <span style={{ color: "#E0715C" }}> · متأخرة</span>
                      ) : (
                        <span style={{ color: track.accent }}> · اليوم</span>
                      )}
                    </div>
                  </div>
                  <button
                    style={styles.doneBtn}
                    onClick={() =>
                      markDone(item.domain.id, item.sub.id, item.stageIndex)
                    }
                  >
                    <CheckCircle2 size={16} />
                    تمت
                  </button>
                </div>
              );
            })}
          </div>
        )}
          </div>
        )}
      </section>

      <ReviewSchedule data={data} goto={goto} />
      </div>

      <div className="dashboardSectionTitle">
        <span>04</span>
        <div><strong>رحلة الأسبوع</strong><small>المجالات والعناوين التي تتحرك فيها الآن</small></div>
      </div>
      <section
        className="dashboardTracks"
        style={{ marginTop: 26, paddingBottom: 90 }}
      >
        <div className="tracksHeadingRow">
          <SectionHeading
            icon={Layers}
            title="نشاط الأسبوع الحالي"
            subtitle="المجالات والعناوين التي تعمل عليها هذا الأسبوع فقط"
          />
        </div>
        <div style={styles.trackGrid}>
          {TRACKS.filter(track => activeWeekDomains.some(domain => domain.track === track.id)).map(track => {
            const Icon = track.icon;
            const domains = activeWeekDomains.filter(d => d.track === track.id);
            const annualItems = data.meta.planItems?.annual || [];
            const totalHours = domains.reduce((total, domain) => {
              const annualDomain = annualItems.find(
                item =>
                  item.track === domain.track &&
                  String(item.domain || "").trim().toLowerCase() ===
                    String(domain.name || "").trim().toLowerCase()
              );
              return total + Number(domain.hours ?? annualDomain?.hours ?? 0);
            }, 0);
            const subCount = domains.reduce(
              (n, d) => n + d.subtopics.length,
              0
            );
            const incompleteCount = domains.reduce(
              (total, domain) =>
                total + domain.subtopics.filter(sub => !isTitleTaskComplete(data, domain, sub)).length,
              0
            );
            const completeCount = Math.max(0, subCount - incompleteCount);
            const completionPercent = subCount ? Math.round((completeCount / subCount) * 100) : 0;
            return (
              <button
                key={track.id}
                onClick={() =>
                  goto({
                    screen: "domains",
                    track: track.id,
                    domainId: null,
                    subtopicId: null,
                  })
                }
                style={{
                  ...styles.trackCard,
                  background: track.bg,
                  borderColor: track.accent + "33",
                }}
              >
                <div className="trackCover" aria-hidden="true">
                  <img src={track.image} alt="" loading="lazy" />
                </div>
                <div
                  style={{
                    ...styles.trackIconWrap,
                    color: track.accent,
                    background: track.accent + "1c",
                  }}
                >
                  <Icon size={22} />
                </div>
                <div
                  style={{
                    ...styles.trackLabel,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span>{track.label}</span>
                  <span
                    style={{
                      color: track.accent,
                      background: `${track.accent}18`,
                      border: `1px solid ${track.accent}33`,
                      borderRadius: 999,
                      padding: "3px 7px",
                      fontSize: 9.5,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {Number.isInteger(totalHours)
                      ? totalHours
                      : Number(totalHours.toFixed(1))} ساعة
                  </span>
                </div>
                <div style={styles.trackMeta}>
                  {domains.length} مجال · {subCount} عنوان
                </div>
                <div style={{ height: 6, marginTop: 10, borderRadius: 99, background: `${track.accent}1c`, overflow: "hidden" }} aria-label={`نسبة اكتمال المسار ${completionPercent}%`}>
                  <div style={{ width: `${completionPercent}%`, height: "100%", borderRadius: 99, background: incompleteCount ? track.accent : COLORS.teal, transition: "width .25s ease" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, paddingTop: 9, borderTop: `1px solid ${track.accent}22` }}>
                  <span style={{ color: incompleteCount ? COLORS.gold : COLORS.teal, fontSize: 10, fontWeight: 800 }}>
                    {incompleteCount ? `غير مكتمل: ${incompleteCount}` : "اكتمل المسار"}
                  </span>
                  <span style={{ color: COLORS.textDim, fontSize: 10 }}>
                    مكتمل {completeCount} من {subCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {activeWeekDomains.length === 0 && (
          <div style={{ ...styles.emptyCard, marginTop: 12 }}>
            لا توجد مجالات أو عناوين مجدولة لهذا الأسبوع حتى الآن. أضفها من الخطة الأسبوعية لتظهر هنا.
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewSchedule({ data, goto }) {
  const [expanded, setExpanded] = useState(false);
  const rows = [];
  data.domains.forEach(domain =>
    domain.subtopics.forEach(sub => {
      if (!isTitleTaskComplete(data, domain, sub)) return;
      const track = TRACKS.find(item => item.id === domain.track) || TRACKS[0];
      rows.push({ domain, sub: { ...sub, dateStarted: sub.dateStarted || todayISO() }, track });
    })
  );
  const scheduledReviewCount = rows.reduce(
    (total, { sub }) =>
      total + REVIEW_STAGES.filter((_, index) => !sub.reviewDone?.[index]).length,
    0
  );
  return (
    <section className="dashboardSchedule" style={{ marginTop: 26 }}>
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} style={{ width: "100%", border: 0, background: "transparent", padding: "8px 0", color: COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "start" }}>
        <CalendarDays size={18} color={COLORS.teal} />
        <span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 15 }}>مواعيد المراجعة القادمة</strong>{expanded && <small style={{ color: COLORS.textDim }}>{scheduledReviewCount ? `${scheduledReviewCount} مراجعة مجدولة` : "لا توجد مواعيد مراجعة حاليًا"}</small>}</span>
        <span style={{ color: COLORS.teal, fontSize: 16 }}>{expanded ? "⌃" : "⌄"}</span>
      </button>
      {expanded && <div>
      <div style={{ color: COLORS.textDim, fontSize: 11, marginBottom: 10 }}>
        المراجعات لا تدخل المعركة اليومية؛ تظهر هنا حسب موعدها وتنتقل إلى لوحة المراجعة عند الاستحقاق.
      </div>
      {rows.length === 0 ? (
        <div style={styles.emptyCard}>
          ابدأ عنوانًا أولًا، وستظهر هنا أيام المراجعة تلقائيًا.
        </div>
      ) : (
        <div style={styles.reviewScheduleList}>
          {rows.slice(0, 30).map(({ domain, sub, track }) => (
            <button
              key={domain.id + sub.id}
              style={styles.reviewScheduleRow}
              onClick={() =>
                goto({
                  screen: "lesson",
                  track: track.id,
                  domainId: domain.id,
                  subtopicId: sub.id,
                })
              }
            >
              <div
                style={{ ...styles.reviewScheduleTitle, color: track.accent }}
              >
                {sub.title}
                <span style={styles.reviewScheduleTitleSpan}>
                  {domain.name}
                </span>
              </div>
              <div style={styles.reviewPills}>
                {REVIEW_STAGES.map((stage, index) => {
                  const dueDate = addDays(sub.dateStarted, stage.days);
                  const isDone = Boolean(sub.reviewDone?.[index]);
                  const daysLate = diffDaysFromToday(dueDate);
                  const isOverdue = !isDone && daysLate > 0;
                  const isToday = daysLate === 0;
                  return (
                    <span
                      key={stage.label}
                      style={{
                        ...styles.reviewPill,
                        borderColor: isDone
                          ? `${COLORS.teal}66`
                          : isOverdue
                            ? "#E0715C99"
                            : isToday
                              ? `${COLORS.gold}99`
                              : COLORS.border,
                        color: isDone
                          ? COLORS.teal
                          : isOverdue
                            ? "#E0715C"
                            : isToday
                              ? COLORS.gold
                              : COLORS.textDim,
                        background: isDone
                          ? `${COLORS.teal}12`
                          : isOverdue
                            ? "#E0715C12"
                            : isToday
                              ? `${COLORS.gold}12`
                              : COLORS.surface2,
                      }}
                    >
                      {isDone ? "✓ " : isOverdue ? "متأخرة · " : ""}
                      {stage.label.replace("المراجعة ", "")} ·{" "}
                      {formatArabicDate(dueDate)}
                    </span>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      )}
        </div>}
    </section>
  );
}

function ProgressChart({ data }) {
  const stats = progressStats(data);
  const history = data.meta.progressHistory || [];
  const values = [
    0,
    ...history.slice(-6).map(point => point.value),
    stats.percent,
  ].slice(-8);
  const points = values
    .map(
      (value, index) =>
        `${10 + index * (300 / Math.max(values.length - 1, 1))},${48 - (value / 100) * 36}`
    )
    .join(" ");
  return (
    <div className="chart-wrap" style={styles.chartWrap}>
      <div style={styles.chartHeader}>
        <div>
          <div style={styles.chartEyebrow}>التقدم الفعلي</div>
          <div style={styles.chartValue}>
            {stats.percent}% <span>منجز</span>
          </div>
        </div>
        <div style={styles.chartSummary}>
          {stats.completed} / {stats.total || 0} مهمة
        </div>
      </div>
      <svg
        viewBox="0 0 320 64"
        width="100%"
        height="76"
        role="img"
        aria-label={`نسبة الإنجاز ${stats.percent}%`}
      >
        <defs>
          <linearGradient id="neonFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#31E5C0" stopOpacity=".25" />
            <stop offset="100%" stopColor="#31E5C0" stopOpacity="0" />
          </linearGradient>
          <filter id="neonGlow">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[12, 30, 48].map(y => (
          <line
            key={y}
            x1="10"
            x2="310"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,.07)"
            strokeDasharray="3 5"
          />
        ))}
        <polyline
          points={`${points} 310,60 10,60`}
          fill="url(#neonFill)"
          stroke="none"
        />
        <polyline
          className="neon-line"
          points={points}
          fill="none"
          stroke="#31E5C0"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#neonGlow)"
        />
        {values.map((value, index) => {
          const x = 10 + index * (300 / Math.max(values.length - 1, 1));
          const y = 48 - (value / 100) * 36;
          return (
            <circle
              className="chart-point"
              key={`${index}-${value}`}
              cx={x}
              cy={y}
              r="2.7"
              fill="#E8C468"
              stroke="#101617"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>
      <div style={styles.chartAxis}>
        <span>بداية الأسبوع</span>
        <span>اليوم</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function DailyPlanModal({ data, persist, onClose, goto }) {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() =>
    getCalendarWeekStart(new Date(`${today}T12:00:00`))
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const tasks = (data.meta.weekTasks || []).map(task =>
    resolveScheduledTask(data, task)
  );
  const currentWeekStart = getCalendarWeekStart(new Date(`${today}T12:00:00`));
  const isCurrentWeek =
    formatLocalCalendarDate(weekStart) ===
    formatLocalCalendarDate(currentWeekStart);
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const dateLabel = date =>
    date.toLocaleDateString("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const getTaskDate = task => getWeekTaskDate(task, Number(today.slice(0, 4)));
  const selectedTasks = selectedDate
    ? tasks.filter(task => getTaskDate(task) === selectedDate)
    : [];
  const selectedWeekDate = selectedDate
    ? new Date(`${selectedDate}T12:00:00`)
    : weekDates[0];
  const selectedWeekMonth = `m${selectedWeekDate.getMonth() + 1}`;
  const selectedWeekQuarter = MONTH_TABS[selectedWeekDate.getMonth()]?.quarter;
  const selectedWeekNumber = getCalendarWeekNumber(
    selectedWeekDate.getFullYear(),
    selectedWeekDate.getMonth(),
    selectedWeekDate
  );
  const selectedWeekDomains = (data.meta.planItems?.monthly || []).filter(
    item =>
      item.month === selectedWeekMonth &&
      (item.sourceQuarter || item.quarter || selectedWeekQuarter) === selectedWeekQuarter &&
      Number(item.week) === Number(selectedWeekNumber)
  );
  const selectedDateReached = isCalendarDateReached(selectedDate, today);
  const shiftWeek = amount => {
    setWeekStart(current => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
    setSelectedDate("");
  };
  const showCurrentWeek = () => {
    const current = getCalendarWeekStart(new Date(`${todayISO()}T12:00:00`));
    setWeekStart(current);
    setSelectedDate(todayISO());
  };
  const toggleTask = taskId => {
    const task = tasks.find(item => item.id === taskId);
    if (task) persist(updateScheduledTask(data, taskId, !task.completed));
  };
  const openWeeklyEditor = () => {
    if (!selectedDate) {
      notifyApp("اختر يومًا أولًا ثم افتح خطته الأسبوعية");
      return;
    }
    const existingTrack = selectedTasks.find(task => task.track)?.track;
    const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
    const selectedWeekStart = getCalendarWeekStart(selectedDateObject);
    const selectedDayIndex = Math.max(
      0,
      Math.min(
        DAY_TABS.length - 1,
        Math.round((selectedDateObject - selectedWeekStart) / 86400000)
      )
    );
    const selectedMonth = `m${selectedDateObject.getMonth() + 1}`;
    const selectedMonthInfo = MONTH_TABS[selectedDateObject.getMonth()];
    onClose();
    goto({
      screen: "weeklyDay",
      quarter: selectedMonthInfo?.quarter || "q1",
      month: selectedMonth,
      week: getCalendarWeekNumber(
        selectedDateObject.getFullYear(),
        selectedDateObject.getMonth(),
        selectedDateObject
      ),
      day: DAY_TABS[selectedDayIndex].key,
      year: selectedDateObject.getFullYear(),
      track: existingTrack || TRACKS[0].id,
    });
  };
  const weekRange = `${dateLabel(weekDates[0])} – ${dateLabel(weekDates[6])}`;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="الخطة اليومية ومهام الأسبوع"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="modal-panel"
        style={{ ...styles.modalPanel, maxHeight: "88vh", overflowY: "auto" }}
      >
        <div style={styles.modalTop}>
          <div>
            <div style={styles.modalEyebrow}>الخطة اليومية</div>
            <h2 style={styles.modalTitle}>اختر أسبوعًا ثم يومًا لعرض مهامه</h2>
            <p style={styles.modalHint}>
              المهام هنا للعرض والمتابعة فقط. لإضافة عنوان أو مهمة، افتح اليوم من الخطة الأسبوعية.
            </p>
          </div>
          <button style={styles.modalClose} onClick={onClose} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 8,
            margin: "4px 0 12px",
          }}
        >
          <button
            type="button"
            style={styles.smallGhostBtn}
            onClick={() => shiftWeek(-1)}
            aria-label="الأسبوع السابق"
            title="الأسبوع السابق"
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            onClick={showCurrentWeek}
            style={{
              ...styles.trackTab,
              color: isCurrentWeek ? COLORS.teal : COLORS.text,
              borderColor: isCurrentWeek ? `${COLORS.teal}66` : COLORS.border,
              background: isCurrentWeek ? `${COLORS.teal}12` : COLORS.surface,
            }}
          >
            {isCurrentWeek ? "الأسبوع الحالي" : "العودة إلى الأسبوع الحالي"}
            <small style={{ display: "block", marginTop: 3, color: COLORS.textDim }}>
              {weekRange}
            </small>
          </button>
          <button
            type="button"
            style={styles.smallGhostBtn}
            onClick={() => shiftWeek(1)}
            aria-label="الأسبوع التالي"
            title="الأسبوع التالي"
          >
            <ChevronLeft size={17} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 7,
          }}
        >
          {weekDates.map((date, index) => {
            const dateKey = formatLocalCalendarDate(date);
            const day = DAY_TABS[index];
            const isToday = dateKey === today;
            const selected = dateKey === selectedDate;
            const count = tasks.filter(task => getTaskDate(task) === dateKey).length;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                aria-pressed={selected}
                aria-label={`${day.label} ${dateLabel(date)}${isToday ? ", اليوم" : ""}`}
                style={{
                  ...styles.trackTab,
                  minHeight: 57,
                  textAlign: "right",
                  color: isToday ? COLORS.teal : selected ? COLORS.gold : COLORS.text,
                  borderColor: isToday
                    ? COLORS.teal
                    : selected
                      ? COLORS.gold
                      : COLORS.border,
                  background: isToday
                    ? `${COLORS.teal}14`
                    : selected
                      ? `${COLORS.gold}12`
                      : COLORS.surface,
                }}
              >
                <strong>{day.label}{isToday ? " · اليوم" : ""}</strong>
                <small style={{ display: "block", color: COLORS.textDim, marginTop: 3 }}>
                  {date.toLocaleDateString("ar-EG", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })} · {count} مهمة
                </small>
              </button>
            );
          })}
        </div>

        <div style={{ ...styles.dailyItemsList, marginTop: 14 }}>
          <div style={{ marginBottom: 12, padding: "10px 11px", border: `1px solid ${COLORS.gold}44`, borderRadius: 11, background: `${COLORS.gold}09` }}>
            <div style={{ color: COLORS.gold, fontWeight: 900, fontSize: 12 }}>مجالات الأسبوع المختار</div>
            <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 4 }}>هذه هي المجالات المسموح بإضافة عناوينها داخل أيام هذا الأسبوع.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {selectedWeekDomains.length ? selectedWeekDomains.map(item => (
                <span key={item.id} style={{ padding: "5px 8px", borderRadius: 99, background: `${COLORS.gold}18`, color: COLORS.text, fontSize: 10 }}>{item.domain}</span>
              )) : <span style={{ color: COLORS.textDim, fontSize: 10 }}>لم توزّع مجالات على هذا الأسبوع بعد.</span>}
            </div>
          </div>
          <div style={{ color: COLORS.teal, fontWeight: 900, marginBottom: 8 }}>
            {selectedDate
              ? `مهام ${dateLabel(new Date(`${selectedDate}T12:00:00`))}`
              : "اختر يومًا لعرض المهام"}
          </div>
          {selectedDate && !selectedDateReached ? (
            <div style={styles.emptyCard}>
              تم حفظ عناوين هذا اليوم في الخطة الأسبوعية، وستظهر هنا عند حلول يومها.
              يمكنك متابعة التخطيط أو تعديل العناوين من صفحة اليوم في الخطة الأسبوعية.
            </div>
          ) : selectedDate && selectedTasks.length ? (
            selectedTasks.map(task => (
              <div key={task.id} style={styles.dailyItemRow}>
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  aria-label={task.completed ? "إلغاء إكمال المهمة" : "إكمال المهمة"}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: task.completed ? COLORS.teal : COLORS.textDim,
                    cursor: "pointer",
                    padding: 3,
                  }}
                >
                  {task.completed ? <CheckCircle2 size={18} /> : <span>○</span>}
                </button>
                <div style={{ flex: 1 }}>
                  <button
                    type="button"
                    onClick={() => openScheduledTitle(data, task, goto)}
                    disabled={!task.subtopicId}
                    style={{
                      color: "inherit",
                      textDecoration: task.completed ? "line-through" : "none",
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      textAlign: "start",
                      fontWeight: 700,
                      cursor: task.subtopicId ? "pointer" : "default",
                    }}
                  >
                    {task.title}
                  </button>
                  <small style={styles.dailyItemMeta}>
                    {task.domain || "مهمة أسبوعية"}
                  </small>
                </div>
              </div>
            ))
          ) : selectedDate ? (
            <div style={styles.emptyCard}>لا توجد مهام أُضيفت لهذا اليوم من الخطة الأسبوعية.</div>
          ) : null}
        </div>

        <div style={{ ...styles.modalActions, marginTop: 12 }}>
          <button
            type="button"
            style={{ ...styles.primaryBtn, flex: 1, minHeight: 48, background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#FFFFFF", border: "1px solid #60A5FA", boxShadow: "0 0 16px #2563EB66", fontWeight: 900, fontSize: 14 }}
            onClick={openWeeklyEditor}
          >
            <CalendarDays size={17} /> توزيع مجالات وعناوين هذا الأسبوع
          </button>
          <button type="button" style={styles.ghostBtn} onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
function DeadlineManager({ meta, onClose, onSave }) {
  const [deadlines, setDeadlines] = useState(
    meta.deadlines?.length ? meta.deadlines : DEFAULT_DEADLINES
  );
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [alertHours, setAlertHours] = useState("24");
  const localDateValue = iso => {
    const d = new Date(iso);
    const pad = value => String(value).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const startEdit = item => {
    setEditingId(item.id);
    setLabel(item.label);
    setDate(localDateValue(item.date));
    setAlertHours(String(item.alertHours || 24));
  };
  const clearForm = () => {
    setEditingId(null);
    setLabel("");
    setDate("");
    setAlertHours("24");
  };
  const saveItem = () => {
    if (!label.trim() || !date) return;
    const nextItem = {
      label: label.trim(),
      date: new Date(date).toISOString(),
      alertHours: Number(alertHours) || 24,
    };
    const nextDeadlines = editingId
      ? deadlines.map(item =>
          item.id === editingId ? { ...item, ...nextItem } : item
        )
      : [
          ...deadlines,
          {
            id: uid(),
            ...nextItem,
            color: TRACKS[deadlines.length % TRACKS.length].accent,
          },
        ];
    setDeadlines(nextDeadlines);
    notifyApp(editingId ? "تم تعديل الموعد بنجاح" : "تمت إضافة الموعد بنجاح");
    onSave(nextDeadlines);
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel deadline-manager" style={styles.modalPanel}>
        <div style={styles.modalTop}>
          <div>
            <div style={styles.modalEyebrow}>لوحة المواعيد</div>
            <h2 style={styles.modalTitle}>تحكم كامل في العدّادات</h2>
            <p style={styles.modalHint}>
              اضغط على القلم بجانب أي موعد لتغيير الاسم أو التاريخ أو الوقت أو
              ساعات التنبيه.
            </p>
          </div>
          <button style={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.deadlineList}>
          {deadlines.map(item => (
            <div key={item.id} style={styles.deadlineManagerRow}>
              <span style={{ ...styles.deadlineDot, background: item.color }} />
              <div style={{ flex: 1 }}>
                <strong>{item.label}</strong>
                <small>
                  {new Date(item.date).toLocaleString("ar-EG")} · تنبيه قبل{" "}
                  {item.alertHours} ساعة
                </small>
              </div>
              <button
                style={styles.smallGhostBtn}
                title="تعديل الموعد"
                onClick={() => startEdit(item)}
              >
                <Pencil size={14} />
              </button>
              {item.id !== "plan-end" && (
                <button
                  style={styles.smallGhostBtn}
                  title="حذف الموعد"
                  onClick={() =>
                    confirmDelete("الموعد", () =>
                      setDeadlines(items =>
                        items.filter(deadline => deadline.id !== item.id)
                      )
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={styles.deadlineForm}>
          <div style={styles.formSectionTitle}>
            {editingId ? "تعديل الموعد المحدد" : "إضافة موعد جديد"}
          </div>
          <label style={styles.fieldLabel}>اسم الموعد</label>
          <input
            style={styles.input}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="مثال: تسليم المشروع"
          />
          <label style={styles.fieldLabel}>التاريخ والوقت</label>
          <input
            style={styles.input}
            type="datetime-local"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <label style={styles.fieldLabel}>التنبيه قبل (بالساعات)</label>
          <input
            style={styles.input}
            type="number"
            min="1"
            max="720"
            value={alertHours}
            onChange={e => setAlertHours(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={editingId
                ? styles.dashedAddBtn
                : { ...styles.dashedAddBtn, background: "#2563EB", borderColor: "#2563EB", borderStyle: "solid", color: "#FFFFFF" }}
              onClick={saveItem}
              disabled={!label.trim() || !date}
            >
              {editingId ? <Pencil size={14} /> : <Plus size={14} />}{" "}
              {editingId ? "حفظ تعديل الموعد" : "إضافة موعد جديد"}
            </button>
            {editingId && (
              <button style={styles.ghostBtn} onClick={clearForm}>
                إلغاء التعديل
              </button>
            )}
          </div>
        </div>
        <div style={styles.modalActions}>
          <button
            style={{ ...styles.primaryBtn, background: COLORS.teal }}
            onClick={() => onSave(deadlines)}
          >
            حفظ المواعيد
          </button>
          <button style={styles.ghostBtn} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

function WeeklyReportModal({ data, onClose }) {
  const stats = progressStats(data);
  const history = data.meta.progressHistory || [];
  const previous = history.length > 1 ? history[history.length - 2].value : 0;
  const change = stats.percent - previous;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel report-panel" style={styles.modalPanel}>
        <div style={styles.modalTop}>
          <div>
            <div style={styles.modalEyebrow}>ملخص أسبوعي تلقائي</div>
            <h2 style={styles.modalTitle}>تقرير تقدمك هذا الأسبوع</h2>
          </div>
          <button style={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.reportHero}>
          <div style={styles.reportPercent}>{stats.percent}%</div>
          <div>
            <strong>نسبة الإنجاز الحالية</strong>
            <p style={styles.modalHint}>
              {change >= 0
                ? `صعود ${change}% مقارنة بآخر نقطة مسجلة`
                : `تراجع ${Math.abs(change)}% مقارنة بآخر نقطة مسجلة`}
            </p>
          </div>
        </div>
        <div style={styles.reportRows}>
          <div>
            <span>المهام المنجزة</span>
            <strong>{stats.completed}</strong>
          </div>
          <div>
            <span>المهام المتبقية</span>
            <strong>{Math.max(stats.total - stats.completed, 0)}</strong>
          </div>
          <div>
            <span>نقاط الرسم المسجلة</span>
            <strong>{history.length}</strong>
          </div>
        </div>
        <button
          style={{
            ...styles.primaryBtn,
            background: COLORS.teal,
            marginTop: 18,
          }}
          onClick={onClose}
        >
          فهمت، نواصل التقدم
        </button>
      </div>
    </div>
  );
}

function Sparkline() {
  return (
    <svg
      width="100%"
      height="56"
      viewBox="0 0 320 56"
      style={{ display: "block" }}
    >
      <polyline
        points="0,40 40,28 80,34 120,14 160,22 200,8 240,18 280,4 320,16"
        fill="none"
        stroke={COLORS.gold}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy={[40, 28, 34, 14, 22, 8, 18, 4, 16][i]}
          r="2.4"
          fill={COLORS.gold}
        />
      ))}
    </svg>
  );
}

function SectionHeading({ icon: Icon, title, subtitle }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <div style={{ color: COLORS.gold }}>
        <Icon size={18} />
      </div>
      <div>
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 16,
            color: COLORS.text,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.textDim }}>{subtitle}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Domains screen (page 2: إدارة المجال والخطة)                           */
/* ---------------------------------------------------------------------- */

const MONTH_TABS = [
  { key: "m1", label: "يناير", quarter: "q1" },
  { key: "m2", label: "فبراير", quarter: "q1" },
  { key: "m3", label: "مارس", quarter: "q1" },
  { key: "m4", label: "أبريل", quarter: "q2" },
  { key: "m5", label: "مايو", quarter: "q2" },
  { key: "m6", label: "يونيو", quarter: "q2" },
  { key: "m7", label: "يوليو", quarter: "q3" },
  { key: "m8", label: "أغسطس", quarter: "q3" },
  { key: "m9", label: "سبتمبر", quarter: "q3" },
  { key: "m10", label: "أكتوبر", quarter: "q4" },
  { key: "m11", label: "نوفمبر", quarter: "q4" },
  { key: "m12", label: "ديسمبر", quarter: "q4" },
];
const DAY_TABS = [
  { key: "thu", label: "الخميس", short: "خميس" },
  { key: "fri", label: "الجمعة", short: "جمعة" },
  { key: "sat", label: "السبت", short: "سبت" },
  { key: "sun", label: "الأحد", short: "أحد" },
  { key: "mon", label: "الاثنين", short: "اثنين" },
  { key: "tue", label: "الثلاثاء", short: "ثلاثاء" },
  { key: "wed", label: "الأربعاء", short: "أربعاء" },
];
const WEEK_NAMES = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

function MonthlyPlanBoard({ data, persist, view = "monthly", goto, focusDate }) {
  const [activeQuarter, setActiveQuarter] = useState(
    () => MONTH_TABS[new Date().getMonth()]?.quarter || "q1"
  );
  const [activeMonth, setActiveMonth] = useState(
    () => `m${new Date().getMonth() + 1}`
  );
  const [activeYear, setActiveYear] = useState(() => new Date().getFullYear());
  const [activeWeek, setActiveWeek] = useState(() => {
    const today = new Date();
    return getCalendarWeekNumber(today.getFullYear(), today.getMonth(), today);
  });
  const [selectedDomains, setSelectedDomains] = useState([]);
  useEffect(() => {
    if (view !== "weekly" && !focusDate) return;
    const today = focusDate
      ? new Date(`${focusDate}T12:00:00`)
      : new Date();
    const month = MONTH_TABS[today.getMonth()];
    setActiveYear(today.getFullYear());
    setActiveQuarter(month?.quarter || "q1");
    setActiveMonth(`m${today.getMonth() + 1}`);
    setActiveWeek(
      getCalendarWeekNumber(today.getFullYear(), today.getMonth(), today)
    );
    setSelectedDomains([]);
  }, [view, focusDate]);
  const planItems = data.meta.planItems || DEFAULT_PLAN_ITEMS;
  const monthlyItems = planItems.monthly || [];
  const quarterItems = planItems.quarterly || [];
  const activeMonthIndex = Number(activeMonth.replace("m", "")) - 1;
  const calendarYear = activeYear;
  const todayDateKey = formatLocalCalendarDate(new Date());
  const calendarWeeks = getMonthCalendarWeeks(calendarYear, activeMonthIndex);
  const monthLabel = MONTH_TABS[activeMonthIndex]?.label || "";
  const activeCalendarWeek = calendarWeeks[activeWeek - 1] || calendarWeeks[0];
  const formatWeekDate = date =>
    `${date.getDate()} ${MONTH_TABS[date.getMonth()]?.label || ""}`;
  const weekTabs = calendarWeeks.map((days, index) => ({
    key: index + 1,
    label: `الأسبوع ${WEEK_NAMES[index]}`,
    range: `${formatWeekDate(days[0])} – ${formatWeekDate(days[6])}`,
  }));
  const now = new Date();
  const periodEnded =
    view === "monthly" &&
    (calendarYear < now.getFullYear() ||
      (calendarYear === now.getFullYear() && activeMonthIndex < now.getMonth()));
  const months = MONTH_TABS.filter(month => month.quarter === activeQuarter);
  const quarterDomains = Array.from(
    new Map(
      quarterItems
        .filter(item => (item.quarter || "q1") === activeQuarter)
        .map(item => [
          `${item.track || ""}::${String(item.domain || "")
            .trim()
            .toLowerCase()}`,
          item,
        ])
    ).values()
  );
  const monthItems = monthlyItems.filter(item => item.month === activeMonth);
  const activeItems =
    view === "weekly"
      ? monthItems.filter(item => Number(item.week || 0) === activeWeek)
      : monthItems;
  const weekTasks = data.meta.weekTasks || [];
  const taskYear = task =>
    Number(task.year || String(task.plannedDate || "").slice(0, 4)) ||
    new Date().getFullYear();
  const activeWeekTasks = weekTasks.filter(
    task =>
      task.quarter === activeQuarter &&
      task.month === activeMonth &&
      Number(task.week) === activeWeek &&
      taskYear(task) === calendarYear
  );
  const weekDomains = activeItems;
  const assignedIds = new Set(
    monthlyItems
      .filter(item => item.sourceQuarter === activeQuarter)
      .map(item => item.sourceQuarterlyId || item.domain)
  );
  const availableDomains =
    view === "weekly"
      ? monthItems.filter(item => !item.week)
      : quarterDomains.filter(
          item => !assignedIds.has(item.id) && !assignedIds.has(item.domain)
        );
  const changeMonth = monthKey => {
    setActiveMonth(monthKey);
    const selectedMonthIndex = Number(monthKey.replace("m", "")) - 1;
    const today = new Date();
    setActiveWeek(
      activeYear === today.getFullYear() && selectedMonthIndex === today.getMonth()
        ? getCalendarWeekNumber(today.getFullYear(), selectedMonthIndex, today)
        : 1
    );
    setSelectedDomains([]);
  };
  const changeQuarter = quarterKey => {
    const firstMonth = MONTH_TABS.find(month => month.quarter === quarterKey);
    const today = new Date();
    const todayMonth = MONTH_TABS[today.getMonth()];
    const isCurrentQuarter =
      activeYear === today.getFullYear() && todayMonth?.quarter === quarterKey;
    setActiveQuarter(quarterKey);
    setActiveMonth(isCurrentQuarter ? `m${today.getMonth() + 1}` : firstMonth?.key || "m1");
    setActiveWeek(
      isCurrentQuarter
        ? getCalendarWeekNumber(today.getFullYear(), today.getMonth(), today)
        : 1
    );
    setSelectedDomains([]);
  };
  const addToWeek = () => {
    if (!selectedDomains.length) return;
    if (periodEnded) {
      notifyApp("هذا الشهر انتهى، لا يمكن إضافة مهمة جديدة");
      return;
    }
    if (view === "weekly") {
      persist({
        ...data,
        meta: {
          ...data.meta,
          planItems: {
            ...planItems,
            monthly: monthlyItems.map(item =>
              selectedDomains.includes(item.id) ? { ...item, week: activeWeek } : item
            ),
          },
        },
      });
    } else {
      const sources = selectPlanItemsByIds(quarterDomains, selectedDomains);
      if (!sources.length) return;
      const entries = sources.map((source, index) => ({
        id: `monthly-${Date.now()}-${index}`,
        track: source.track,
        domain: source.domain,
        title: source.title || source.domain,
        progress: 0,
        month: activeMonth,
        week: null,
        sourceQuarter: activeQuarter,
        sourceQuarterlyId: source.id,
      }));
      persist({
        ...data,
        meta: {
          ...data.meta,
          planItems: { ...planItems, monthly: [...entries, ...monthlyItems] },
        },
      });
    }
    setSelectedDomains([]);
    notifyApp(
      view === "weekly"
        ? `تم توزيع ${selectedDomains.length} مجال على الخطة الأسبوعية`
        : `تمت إضافة ${selectedDomains.length} مجال إلى الخطة الشهرية`
    );
  };
  const assignMonthTaskToWeek = (itemId, weekValue) => {
    const nextWeek = weekValue ? Number(weekValue) : null;
    persist({
      ...data,
      meta: {
        ...data.meta,
        planItems: {
          ...planItems,
          monthly: monthlyItems.map(item =>
            item.id === itemId ? { ...item, week: nextWeek } : item
          ),
        },
      },
    });
    notifyApp(nextWeek ? "تم ربط مهمة الشهر بالأسبوع" : "تم إلغاء ربط المهمة بالأسبوع");
  };
  const removeAssignment = item =>
    confirmDelete(
      view === "weekly" ? `إلغاء توزيع ${item.domain}` : `مهمة ${item.domain}`,
      () =>
        persist({
          ...data,
          meta: {
            ...data.meta,
            planItems: {
              ...planItems,
              monthly:
                view === "weekly"
                  ? monthlyItems.map(entry =>
                      entry.id === item.id ? { ...entry, week: null } : entry
                    )
                  : monthlyItems.filter(entry => entry.id !== item.id),
            },
          },
        })
    );
  const goToNextStage = () => {
    if (view === "monthly") {
      const monthStart = formatLocalCalendarDate(
        new Date(calendarYear, activeMonthIndex, 1)
      );
      goto?.({ screen: "planWorkspace", planKey: "weekly", focusDate: monthStart });
      return;
    }
    document.getElementById("weeklyDaysGrid")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  return (
    <section className="goal-tabs plan-board" style={styles.goalTabs}>
      <div
        style={{
          padding: "16px 14px 10px",
          background: `linear-gradient(135deg, ${COLORS.teal}18, transparent)`,
        }}
      >
        <div style={{ color: COLORS.teal, fontSize: 11, fontWeight: 900 }}>
          {view === "weekly" ? "المرحلة ٣ من ٤ · التوزيع الأسبوعي" : "المرحلة ٢ من ٤ · التوزيع الشهري"}
        </div>
        <h2
          style={{
            margin: "5px 0 0",
            color: COLORS.text,
            fontFamily: FONT_HEAD,
            fontSize: 21,
          }}
        >
          {view === "weekly"
            ? "وزّع مهام الشهر على الأسابيع، ثم اعرض الأسبوع كاملًا لإضافة عناوين كل يوم"
            : "انقل أهداف الربع المختار إلى هذا الشهر، ثم وزّعها على الأسابيع"}
        </h2>
        <p
          style={{
            margin: "7px 0 0",
            color: COLORS.textDim,
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          {view === "weekly"
            ? `حدّد الأسبوع ثم وزّع عليه مهام الشهر (${calendarWeeks.length} أسابيع). اعرض الأيام السبعة معًا، ثم افتح اليوم الذي تريد إضافة عناوينه ومصادره.`
            : "اختر الربع والشهر، ثم أضف أهداف الربع إلى الشهر واربط كل مهمة بالأسبوع المناسب."}
        </p>
      </div>
      <div style={{ padding: "0 11px 11px", display: "grid", gap: 6 }}>
        <button
          type="button"
          onClick={goToNextStage}
          style={{ ...styles.primaryBtn, background: view === "monthly" ? COLORS.teal : COLORS.gold, color: "#111827" }}
        >
          <ChevronLeft size={16} />
          {view === "monthly"
            ? "الخطوة التالية: توزيع مهام الشهر على الأسابيع"
            : "الخطوة الأخيرة: عرض الأسبوع كاملًا لإضافة عناوين الأيام"}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 7,
          padding: 11,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {QUARTER_TABS.map(quarter => (
          <button
            key={quarter.key}
            type="button"
            onClick={() => changeQuarter(quarter.key)}
            style={{
              ...styles.goalTabButton,
              color:
                activeQuarter === quarter.key ? COLORS.teal : COLORS.textDim,
              borderColor:
                activeQuarter === quarter.key
                  ? `${COLORS.teal}66`
                  : "transparent",
              background:
                activeQuarter === quarter.key
                  ? `${COLORS.teal}12`
                  : "transparent",
            }}
          >
            {quarter.label}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 7,
          overflowX: "auto",
          padding: "11px 11px 4px",
        }}
      >
        {months.map(month => (
          <button
            key={month.key}
            type="button"
            onClick={() => changeMonth(month.key)}
            style={{
              ...styles.goalTabButton,
              minWidth: 82,
              color: activeMonth === month.key ? COLORS.teal : COLORS.textDim,
              borderColor:
                activeMonth === month.key ? `${COLORS.teal}66` : "transparent",
              background:
                activeMonth === month.key ? `${COLORS.teal}12` : "transparent",
            }}
          >
            {month.label}
          </button>
        ))}
      </div>
      {view === "monthly" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "0 11px 12px" }}>
          <details aria-label="مجالات من الربع السنوي" style={{ ...styles.input, margin: 0, padding: 7, opacity: periodEnded ? 0.55 : 1 }}>
            <summary style={{ color: COLORS.textDim, fontSize: 10, padding: "0 3px 3px", cursor: "pointer" }}>اختر مجالًا أو أكثر من {QUARTER_TABS.find(item => item.key === activeQuarter)?.label}</summary>
            {availableDomains.length ? availableDomains.map(item => (
              <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, background: selectedDomains.includes(item.id) ? `${COLORS.teal}16` : COLORS.surface2, border: `1px solid ${selectedDomains.includes(item.id) ? COLORS.teal + "66" : COLORS.border}`, color: COLORS.text, fontSize: 11, cursor: periodEnded ? "not-allowed" : "pointer" }}>
                <input type="checkbox" checked={selectedDomains.includes(item.id)} disabled={periodEnded} onChange={() => setSelectedDomains(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />
                <span>{item.domain}</span>
              </label>
            )) : <span style={{ color: COLORS.textDim, fontSize: 10 }}>لا توجد مجالات متاحة.</span>}
          </details>
          <button type="button" style={{ ...styles.primaryBtn, background: periodEnded ? COLORS.border : "#2563EB", color: "#FFFFFF" }} onClick={addToWeek} disabled={periodEnded || !selectedDomains.length}>
            <Plus size={15} /> {periodEnded ? "الشهر منتهٍ" : `إضافة ${selectedDomains.length || "المجالات"} للشهر`}
          </button>
        </div>
      )}
      {view === "monthly" && (
        <section style={{ margin: "0 11px 12px", padding: 12, border: `1px solid ${COLORS.gold}55`, borderRadius: 13, background: `${COLORS.gold}09` }}>
          <div style={{ color: COLORS.gold, fontWeight: 900, fontSize: 13 }}>المرحلة الأولى: توزيع مهام الشهر على الأسابيع <span style={{ color: COLORS.textDim, fontSize: 11 }}>({monthItems.length} مهمة)</span></div>
          <div style={{ color: COLORS.textDim, fontSize: 10.5, lineHeight: 1.7, marginTop: 4 }}>حدد لكل مهمة من مهام هذا الشهر الأسبوع الذي ستعمل عليه. بعد ذلك ستجدها في الخطة الأسبوعية لتوزيعها على الأيام.</div>
          <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
            {monthItems.length ? monthItems.map(item => (
              <div key={`month-week-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 10, background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: COLORS.teal, fontSize: 10, fontWeight: 800 }}>{item.domain}</div>
                  <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                </div>
                <select aria-label={`أسبوع مهمة ${item.title}`} disabled={periodEnded} value={item.week || ""} onChange={event => assignMonthTaskToWeek(item.id, event.target.value)} style={{ ...styles.input, width: 132, margin: 0, padding: "7px 8px", opacity: periodEnded ? 0.55 : 1 }}>
                  <option value="">اختر الأسبوع</option>
                  {weekTabs.map(week => <option key={week.key} value={week.key}>{week.label}</option>)}
                </select>
              </div>
            )) : <div style={styles.emptyCard}>أضف مهامًا إلى هذا الشهر أولًا لتوزيعها على الأسابيع.</div>}
          </div>
        </section>
      )}
      {view === "weekly" && (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 11px 4px" }}>
          <details aria-label="مجالات من الشهر للتوزيع الأسبوعي" style={{ ...styles.input, margin: 0, padding: 7, opacity: periodEnded ? 0.55 : 1 }}>
            <summary style={{ color: COLORS.textDim, fontSize: 10, padding: "0 3px 3px", cursor: "pointer" }}>اختر مجالًا أو أكثر لتوزيعهم على الأسبوع</summary>
            {availableDomains.length ? availableDomains.map(item => (
              <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, background: selectedDomains.includes(item.id) ? `${COLORS.teal}16` : COLORS.surface2, border: `1px solid ${selectedDomains.includes(item.id) ? COLORS.teal + "66" : COLORS.border}`, color: COLORS.text, fontSize: 11, cursor: periodEnded ? "not-allowed" : "pointer" }}>
                <input type="checkbox" checked={selectedDomains.includes(item.id)} disabled={periodEnded} onChange={() => setSelectedDomains(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />
                <span>{item.domain}</span>
              </label>
            )) : <span style={{ color: COLORS.textDim, fontSize: 10 }}>لا توجد مجالات متاحة.</span>}
          </details>
          <button type="button" style={{ ...styles.primaryBtn, background: periodEnded ? COLORS.border : "#2563EB", color: "#FFFFFF" }} onClick={addToWeek} disabled={periodEnded || !selectedDomains.length}>
            <Plus size={15} /> {periodEnded ? "الشهر منتهٍ" : `توزيع ${selectedDomains.length || "المجالات"}`}
          </button>
        </div>
        <div style={{ padding: "0 11px 4px", color: COLORS.textDim, fontSize: 10 }}>
          يمكنك تحديد أكثر من مجال معًا ثم توزيعهم على {weekTabs.find(item => item.key === activeWeek)?.label}.
        </div>
        <div style={{ padding: "9px 11px 4px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <strong style={{ color: COLORS.text, fontSize: 12 }}>
              تقويم {monthLabel} {calendarYear}
            </strong>
            <span style={{ color: COLORS.textDim, fontSize: 10 }}>
              بداية الأسبوع: الخميس
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 4,
            }}
          >
            {DAY_TABS.map(day => (
              <div
                key={`weekday-${day.key}`}
                style={{
                  padding: "5px 1px",
                  textAlign: "center",
                  color: COLORS.gold,
                  fontSize: 9,
                  fontWeight: 800,
                }}
              >
                {day.short}
              </div>
            ))}
            {calendarWeeks.flatMap((days, weekIndex) =>
              days.map((date, dayIndex) => {
                const day = DAY_TABS[dayIndex];
                const weekNumber = weekIndex + 1;
                const isCurrentMonth = date.getMonth() === activeMonthIndex;
                const cellMonthLabel = MONTH_TABS[date.getMonth()]?.label || "";
                const isToday = formatLocalCalendarDate(date) === todayDateKey;
                const isSelected = activeWeek === weekNumber;
                const taskCount = weekTasks.filter(
                  task =>
                    task.quarter === activeQuarter &&
                    task.month === activeMonth &&
                    Number(task.week) === weekNumber &&
                    taskYear(task) === calendarYear &&
                    task.day === day.key
                ).length;
                return (
                  <button
                    key={formatLocalCalendarDate(date)}
                    type="button"
                    aria-label={`${day.label} ${date.getDate()} ${cellMonthLabel}${isToday ? ", اليوم" : ""}, الأسبوع ${WEEK_NAMES[weekIndex]}`}
                    title={`${day.label} ${date.getDate()} ${cellMonthLabel}`}
                    aria-pressed={isSelected}
                    onClick={() => setActiveWeek(weekNumber)}
                    style={{
                      minHeight: 43,
                      padding: "4px 2px",
                      position: "relative",
                      borderRadius: 8,
                      border: `${isToday ? 2 : 1}px solid ${isToday ? COLORS.teal : isSelected ? COLORS.gold : COLORS.border}`,
                      background: isToday
                        ? `${COLORS.teal}20`
                        : isSelected
                          ? `${COLORS.gold}20`
                          : COLORS.surface,
                      color: isCurrentMonth ? COLORS.text : COLORS.textDim,
                      opacity: isCurrentMonth ? 1 : 0.48,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: isSelected ? 900 : 600 }}>
                      {date.getDate()}
                    </span>
                    {isToday && (
                      <span
                        style={{
                          display: "block",
                          color: COLORS.teal,
                          fontSize: 7,
                          fontWeight: 900,
                          lineHeight: 1,
                        }}
                      >
                        اليوم
                      </span>
                    )}
                    {taskCount > 0 && (
                      <span
                        aria-label={`${taskCount} مهام`}
                        style={{
                          position: "absolute",
                          insetInlineEnd: 3,
                          bottom: 3,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: COLORS.teal,
                        }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 7 }}>
            الأسبوع المحدد: {weekTabs[activeWeek - 1]?.label} · {activeCalendarWeek?.[0].toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} – {activeCalendarWeek?.[6].toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
          </div>
        </div>
        </>
      )}
      {view === "weekly" && (
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            gap: 7,
            padding: "7px 11px 11px",
          }}
        >
          {weekTabs.map(week => (
            <button
              key={week.key}
              type="button"
              onClick={() => setActiveWeek(week.key)}
              style={{
                ...styles.goalTabButton,
                minWidth: 86,
                flex: "0 0 auto",
                color: activeWeek === week.key ? COLORS.gold : COLORS.textDim,
                borderColor:
                  activeWeek === week.key ? `${COLORS.gold}66` : "transparent",
                background:
                  activeWeek === week.key ? `${COLORS.gold}12` : "transparent",
                fontSize: 9,
              }}
            >
              <span>{week.label}</span>
              <small style={{ display: "block", fontSize: 9, opacity: 0.78 }}>
                {week.range}
              </small>
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: "0 11px 14px", display: "grid", gap: 8 }}>
        {activeItems.length ? (
          activeItems.map(item => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "11px 12px",
                border: `1px solid ${COLORS.teal}44`,
                borderRadius: 11,
                background: `${COLORS.teal}09`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{ color: COLORS.teal, fontSize: 10, fontWeight: 800 }}
                >
                  {item.domain}
                </div>
                <div
                  style={{ color: COLORS.text, fontWeight: 700, fontSize: 12 }}
                >
                  {item.title}
                </div>
              </div>
              <span style={{ color: COLORS.textDim, fontSize: 10 }}>
                {view === "weekly" ? "موزعة على هذا الأسبوع" : "مهمة هذا الشهر"}
              </span>
              <button
                type="button"
                style={styles.smallGhostBtn}
                onClick={() => removeAssignment(item)}
                aria-label="حذف التوزيع"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div style={styles.emptyCard}>
            {view === "weekly"
              ? `لا توجد مهام موزعة على ${weekTabs.find(item => item.key === activeWeek)?.label}.`
              : `لا توجد مهام في شهر ${MONTH_TABS.find(item => item.key === activeMonth)?.label}.`}
          </div>
        )}
      </div>
      {view === "weekly" && (
        <div
          id="weeklyDaysGrid"
          style={{
            margin: "0 11px 14px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            overflow: "hidden",
            background: COLORS.surface,
            boxShadow: "0 10px 24px rgba(0,0,0,.12)",
          }}
        >
          <div
            style={{
              padding: "14px 14px 11px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              borderBottom: `1px solid ${COLORS.border}`,
              background: `linear-gradient(135deg, ${COLORS.teal}12, transparent)`,
            }}
          >
            <div>
              <div
                style={{ color: COLORS.teal, fontWeight: 900, fontSize: 13 }}
              >
                المرحلة الثانية: توزيع مهام الأسبوع على الأيام
              </div>
              <div
                style={{ color: COLORS.textDim, fontSize: 10.5, marginTop: 4 }}
              >
                هذه المهام وصلت من الشهرية بعد ربطها بالأسبوع المحدد؛ وزّعها الآن على أيام الأسبوع السبعة.
              </div>
            </div>
            <span style={{ color: COLORS.textDim, fontSize: 10 }}>
              {activeWeekTasks.length} مهمة
            </span>
          </div>
          <div style={{ padding: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))",
                  gap: 8,
                }}
              >
                {DAY_TABS.map((day, index) => {
                  const dayDate = activeCalendarWeek[index];
                  const dayDateKey = formatLocalCalendarDate(dayDate);
                  const isToday = dayDateKey === todayDateKey;
                  const hasPassed = dayDateKey < todayDateKey;
                  const dayDateLabel = dayDate.toLocaleDateString("ar-EG", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  });
                  const dayTasks = activeWeekTasks.filter(
                    task => task.day === day.key
                  );
                  return (
                    <div
                      key={day.key}
                      style={{
                        minHeight: 220,
                        display: "flex",
                        flexDirection: "column",
                        border: `${isToday ? 2 : 1}px solid ${isToday ? COLORS.teal : hasPassed ? `${COLORS.textDim}55` : index === 0 ? `${COLORS.gold}55` : COLORS.border}`,
                        borderRadius: 11,
                        background: isToday ? `${COLORS.teal}10` : hasPassed ? `${COLORS.surface}cc` : `${COLORS.surface2}88`,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 9px",
                          textAlign: "center",
                          color: isToday ? COLORS.teal : hasPassed ? COLORS.textDim : index === 0 ? COLORS.gold : COLORS.teal,
                          fontWeight: 900,
                          fontSize: 11,
                          background:
                            index === 0
                              ? `${COLORS.gold}12`
                              : `${COLORS.teal}10`,
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}
                      >
                        <div>{day.label}</div>
                        <div
                          style={{
                            color: COLORS.textDim,
                            fontSize: 10,
                            marginTop: 3,
                          }}
                        >
                          {dayDateLabel}
                          {isToday ? (
                            <div style={{ color: COLORS.teal, fontWeight: 900, marginTop: 2 }}>
                              اليوم
                            </div>
                          ) : hasPassed ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, color: COLORS.textDim, fontWeight: 800, marginTop: 2 }}>
                              <CheckCircle2 size={11} /> انتهى
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div
                        style={{ display: "grid", gap: 6, padding: 7, flex: 1 }}
                      >
                        <div
                          style={{
                            color: COLORS.textDim,
                            fontSize: 10,
                            textAlign: "center",
                            marginTop: 8,
                          }}
                        >
                          {dayTasks.length
                            ? `${dayTasks.length} مهمة مجدولة`
                            : "لا توجد مهام بعد"}
                        </div>
                        <button
                          type="button"
                          aria-label={`فتح ${day.label} ${dayDateLabel}`}
                          onClick={() =>
                            goto?.({
                              screen: "weeklyDay",
                              quarter: activeQuarter,
                              month: activeMonth,
                              week: activeWeek,
                              day: day.key,
                              year: calendarYear,
                            })
                          }
                          style={{
                            ...styles.smallGhostBtn,
                            width: "100%",
                            color: COLORS.teal,
                            borderColor: `${COLORS.teal}55`,
                            marginTop: "auto",
                          }}
                        >
                          فتح يوم {day.short}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>
          {!weekDomains.length && (
            <div style={{ margin: "0 11px 11px", ...styles.emptyCard }}>
              التواريخ ظاهرة لكل الأيام. وزّع مجالًا على الأسبوع لتتمكن من إضافة مهامه.
            </div>
          )}
        </div>
      )}
      <div
        style={{
          margin: "0 11px 14px",
          padding: "10px 12px",
          borderRadius: 10,
          background: `${COLORS.gold}10`,
          color: COLORS.textDim,
          fontSize: 10.5,
          lineHeight: 1.7,
        }}
      >
        المجالات المتاحة من الربع: {quarterDomains.length} — المتبقي للتوزيع:{" "}
        {availableDomains.length}
      </div>
    </section>
  );
}

function WeeklyDayPage({ data, persist, nav, goto, uploadAsset }) {
  const day = DAY_TABS.find(item => item.key === nav.day) || DAY_TABS[0];
  const monthIndex = Number(String(nav.month || "m1").replace("m", "")) - 1;
  const dayIndex = DAY_TABS.findIndex(item => item.key === day.key);
  const year = Number(nav.year) || new Date().getFullYear();
  const selectedDate = getCalendarWeekDate(
    year,
    monthIndex,
    Number(nav.week),
    dayIndex
  );
  const selectedDateKey = formatLocalCalendarDate(selectedDate);
  const todayDateKey = todayISO();
  const isEnded = selectedDateKey < todayDateKey;
  const planItems = data.meta.planItems || DEFAULT_PLAN_ITEMS;
  const weekItems = (planItems.monthly || []).filter(
    item =>
      item.month === nav.month &&
      (item.sourceQuarter || item.quarter || nav.quarter) === nav.quarter &&
      Number(item.week) === Number(nav.week)
  );
  const weekTasks = data.meta.weekTasks || [];
  const tasks = weekTasks.filter(
    task => getWeekTaskDate(task, year) === selectedDateKey
  ).map(task => resolveScheduledTask(data, task));
  const [domainId, setDomainId] = useState("");
  const [title, setTitle] = useState("");
  const source = weekItems.find(item => item.id === domainId);
  const sourceDomain = source
    ? data.domains.find(
        item => item.track === source.track && item.name === source.domain
      )
    : null;
  const dayDateLabel = selectedDate.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isToday = selectedDateKey === todayDateKey;
  const addTask = () => {
    if (isEnded) {
      notifyApp("اليوم انتهى، لا يمكن إضافة عنوان جديد");
      return;
    }
    const value = richTextToPlainText(title).trim();
    const titleHtml = sanitizeRichTextHTML(title);
    if (!value || !source || !sourceDomain) return;
    const duplicateTitle = sourceDomain.subtopics.some(
      item => item.title.trim().toLowerCase() === value.toLowerCase()
    );
    if (duplicateTitle) {
      notifyApp("هذا العنوان موجود بالفعل داخل المجال");
      return;
    }
    const subtopic = {
      ...emptySubtopic(value),
      titleHtml,
      scheduledDate: selectedDateKey,
      completed: false,
    };
    persist({
      ...data,
      domains: data.domains.map(item =>
        item.id === sourceDomain.id
          ? { ...item, subtopics: [...item.subtopics, subtopic] }
          : item
      ),
      meta: {
        ...data.meta,
        weekTasks: [
          ...weekTasks,
          {
            id: `weekly-title-${subtopic.id}`,
            day: day.key,
            title: value,
            titleHtml,
            domain: sourceDomain.name,
            track: sourceDomain.track,
            domainId: sourceDomain.id,
            subtopicId: subtopic.id,
            quarter: nav.quarter,
            month: nav.month,
            week: Number(nav.week),
            year,
            plannedDate: formatLocalCalendarDate(selectedDate),
            completed: false,
          },
        ],
      },
    });
    setTitle("");
    notifyApp("تمت إضافة العنوان إلى المجال واليوم المحدد");
    return true;
  };
  const toggleTask = task =>
    persist(updateScheduledTask(data, task.id, !task.completed));
  const removeTask = task =>
    confirmDelete(`العنوان ${task.title} من المجال`, () =>
      persist(removeScheduledTask(data, task.id))
    );
  return (
    <div style={styles.page}>
      <button
        style={styles.backRow}
        onClick={() =>
          goto({ screen: "planWorkspace", planKey: "weekly", focusDate: selectedDateKey })
        }
      >
        <ChevronRight size={18} /> العودة إلى جدول الأسبوع
      </button>
      <section
        style={{
          ...styles.goalTabs,
          marginTop: 8,
          borderColor: `${COLORS.teal}55`,
        }}
      >
        <div
          style={{
            padding: "18px 16px",
            background: `linear-gradient(135deg, ${COLORS.teal}18, transparent)`,
          }}
        >
          <div style={{ color: COLORS.teal, fontSize: 11, fontWeight: 900 }}>
            الخطة الأسبوعية
          </div>
          <h1
            style={{
              margin: "5px 0 0",
              color: COLORS.text,
              fontFamily: FONT_HEAD,
              fontSize: 24,
            }}
          >
            {day.label} · {dayDateLabel}
            {isToday && (
              <span style={{ color: COLORS.teal, fontSize: 13 }}> · اليوم</span>
            )}
            {isEnded && (
              <span style={{ color: COLORS.textDim, fontSize: 13 }}> · انتهى</span>
            )}
          </h1>
          <p style={{ color: COLORS.textDim, fontSize: 11, margin: "7px 0 0" }}>
            الأسبوع {nav.week} ·{" "}
            {MONTH_TABS.find(item => item.key === nav.month)?.label}
          </p>
        </div>
        <div
          style={{
            display: "grid",
            alignItems: "start",
            gridTemplateColumns: "1.2fr 2fr auto",
            gap: 8,
            padding: 13,
          }}
        >
          <select
            aria-label="مهمة من الأسبوع"
            value={source?.id || ""}
            onChange={event => setDomainId(event.target.value)}
            disabled={isEnded}
            style={{ ...styles.input, margin: 0 }}
          >
            <option value="">اختر مهمة من هذا الأسبوع</option>
            {weekItems.map(item => (
              <option key={item.id} value={item.id}>
                {item.title} — {item.domain}
              </option>
            ))}
          </select>
          <RichTextEditor
            value={title}
            onChange={setTitle}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (addTask()) event.currentTarget.blur();
              }
            }}
            disabled={isEnded}
            placeholder="اكتب عنوان الموضوع الذي ستدرسه"
            ariaLabel="عنوان جديد داخل المجال"
            accent={COLORS.teal}
            toolbarEnabled
            compact
            minHeight={44}
            style={{ ...styles.input, margin: 0, minHeight: 44, padding: "7px 9px", fontSize: 12 }}
          />
          <button
            type="button"
            onClick={addTask}
            disabled={!isEnded && (!richTextToPlainText(title).trim() || !source || !sourceDomain)}
            style={{ ...styles.primaryBtn, background: "#2563EB", color: "#FFFFFF" }}
          >
            {isEnded ? "اليوم انتهى" : <><Plus size={15} /> إضافة عنوان</>}
          </button>
        </div>
        <div style={{ padding: "0 13px 14px", display: "grid", gap: 8 }}>
          {tasks.length ? (
            tasks.map(task => (
              <div
                key={task.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px",
                  borderRadius: 11,
                  border: `1px solid ${task.completed ? `${COLORS.teal}66` : COLORS.border}`,
                  background: task.completed
                    ? `${COLORS.teal}12`
                    : COLORS.surface,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  aria-label={task.completed ? "إلغاء إكمال العنوان" : "إكمال العنوان"}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: task.completed ? COLORS.teal : COLORS.textDim,
                    fontSize: 19,
                    cursor: "pointer",
                  }}
                >
                  {task.completed ? "✓" : "○"}
                </button>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: COLORS.teal,
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    {task.domain}
                  </div>
                  <button
                    type="button"
                    onClick={() => openScheduledTitle(data, task, goto)}
                    disabled={!task.subtopicId}
                    style={{
                      color: COLORS.text,
                      fontSize: 13,
                      textDecoration: task.completed ? "line-through" : "none",
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      textAlign: "start",
                      cursor: task.subtopicId ? "pointer" : "default",
                    }}
                  >
                    {task.title}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeTask(task)}
                  aria-label="حذف المهمة"
                  style={styles.smallGhostBtn}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          ) : (
            <div style={styles.emptyCard}>
              لا توجد مهام لهذا اليوم. اكتب أول مهمة من النموذج بالأعلى.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PlanBoard({ data, persist, initialPlan }) {
  const visiblePlanLevels = PLAN_LEVELS.filter(
    level => ["monthly", "weekly"].includes(level.key)
  );
  const [activePlan, setActivePlan] = useState(
    visiblePlanLevels.some(level => level.key === initialPlan)
      ? initialPlan
      : "monthly"
  );
  const [newTrack, setNewTrack] = useState(TRACKS[0].id);
  const [newDomain, setNewDomain] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [draggedItemId, setDraggedItemId] = useState(null);
  const planItems = data.meta.planItems || DEFAULT_PLAN_ITEMS;
  useEffect(() => {
    if (visiblePlanLevels.some(level => level.key === initialPlan))
      setActivePlan(initialPlan);
  }, [initialPlan]);
  const currentLevel =
    visiblePlanLevels.find(level => level.key === activePlan) ||
    visiblePlanLevels[0];
  const items = planItems[activePlan] || [];
  const planKey = item =>
    `${String(item.domain || "")
      .trim()
      .toLowerCase()}::${String(item.title || "")
      .trim()
      .toLowerCase()}`;
  const updateItemEverywhere = (itemId, patch) => {
    const source = items.find(entry => entry.id === itemId);
    if (!source) return;
    const sourceKey = planKey(source);
    const nextSource = { ...source, ...patch };
    const nextKey = planKey(nextSource);
    const nextPlanItems = Object.fromEntries(
      Object.entries(planItems).map(([level, levelItems]) => [
        level,
        (levelItems || []).map(entry =>
          planKey(entry) === sourceKey
            ? {
                ...entry,
                ...patch,
                ...(level === "quarterly" && patch.domain
                  ? { parentDomain: patch.domain }
                  : {}),
              }
            : entry
        ),
      ])
    );
    if (sourceKey !== nextKey) {
      Object.keys(nextPlanItems).forEach(level => {
        nextPlanItems[level] = nextPlanItems[level].map(entry =>
          planKey(entry) === nextKey ? { ...entry, ...patch } : entry
        );
      });
    }
    persist({ ...data, meta: { ...data.meta, planItems: nextPlanItems } });
  };
  const deleteItemEverywhere = itemId => {
    const source = items.find(entry => entry.id === itemId);
    if (!source) return;
    const sourceKey = planKey(source);
    const nextPlanItems = Object.fromEntries(
      Object.entries(planItems).map(([level, levelItems]) => [
        level,
        (levelItems || []).filter(entry => planKey(entry) !== sourceKey),
      ])
    );
    confirmDelete("المهمة من كل الخطط المرتبطة", () =>
      persist({ ...data, meta: { ...data.meta, planItems: nextPlanItems } })
    );
  };
  const updateItems = (level, nextItems) =>
    persist({
      ...data,
      meta: { ...data.meta, planItems: { ...planItems, [level]: nextItems } },
    });
  const reorderItems = targetId => {
    if (!draggedItemId || draggedItemId === targetId) return;
    const nextItems = moveItem(items, draggedItemId, targetId);
    updateItems(activePlan, nextItems);
    setDraggedItemId(null);
    notifyApp("تم ترتيب الخطة وحفظها");
  };
  const movePlanItem = (itemId, offset) => {
    const index = items.findIndex(item => item.id === itemId);
    const target = items[index + offset];
    if (!target) return;
    updateItems(activePlan, moveItem(items, itemId, target.id));
  };
  const progressFor = item => {
    const weekTasks = data.meta.weekTasks || [];
    if (activePlan === "annual")
      return annualItemProgress(
        item,
        planItems.quarterly || [],
        planItems.monthly || [],
        weekTasks
      );
    if (activePlan === "quarterly")
      return quarterlyItemProgress(item, planItems.monthly || [], weekTasks);
    if (activePlan === "monthly") return weeklyTaskProgress(item, weekTasks);
    return Number(item.progress || 0);
  };
  const addPlanItem = () => {
    if (!newDomain.trim() || !newTitle.trim()) return;
    const item = {
      id: `${activePlan}-${Date.now()}`,
      track: newTrack,
      domain: newDomain.trim(),
      title: newTitle.trim(),
      progress: 0,
      ...(activePlan === "quarterly" ? { parentDomain: newDomain.trim() } : {}),
    };
    const currentHasItem = items.some(
      entry => planKey(entry) === planKey(item)
    );
    const nextData = {
      ...data,
      meta: {
        ...data.meta,
        planItems: {
          ...planItems,
          [activePlan]: currentHasItem ? items : [item, ...items],
        },
      },
    };
    if (activePlan === "daily") {
      const matchingDomain = data.domains.find(
        domain => domain.track === newTrack && domain.name === newDomain.trim()
      );
      if (
        matchingDomain &&
        !matchingDomain.subtopics.some(
          subtopic =>
            subtopic.title.trim().toLowerCase() ===
            newTitle.trim().toLowerCase()
        )
      ) {
        nextData.domains = data.domains.map(domain =>
          domain.id === matchingDomain.id
            ? {
                ...domain,
                subtopics: [
                  ...domain.subtopics,
                  emptySubtopic(newTitle.trim()),
                ],
              }
            : domain
        );
      }
    }
    persist(nextData);
    notifyApp(
      activePlan === "daily"
        ? "تمت الإضافة إلى اليومية والمجال"
        : "تمت الإضافة بنجاح"
    );
    setNewDomain("");
    setNewTitle("");
  };
  return (
    <section className="goal-tabs plan-board" style={styles.goalTabs}>
      <div
        style={{
          padding: "14px 14px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 800,
              fontSize: 16,
              color: COLORS.text,
            }}
          >
            خطتي
          </div>
          <div style={{ color: COLORS.textDim, fontSize: 11, marginTop: 3 }}>
            المجال والعنوان والتقدم في مكان واحد
          </div>
        </div>
        <span
          style={{ color: currentLevel.color, fontSize: 11, fontWeight: 800 }}
        >
          حفظ تلقائي
        </span>
      </div>
      <div className="goal-tab-bar" style={styles.goalTabBar}>
        {visiblePlanLevels.map(level => (
          <button
            key={level.key}
            className="goal-tab-button"
            onClick={() =>
              setActivePlan(activePlan === level.key ? null : level.key)
            }
            style={{
              ...styles.goalTabButton,
              color: activePlan === level.key ? level.color : COLORS.textDim,
              borderColor:
                activePlan === level.key ? `${level.color}66` : "transparent",
              background:
                activePlan === level.key ? `${level.color}12` : "transparent",
            }}
          >
            {level.label}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1.5fr auto",
          gap: 8,
          padding: "11px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <select
          style={{
            ...styles.input,
            margin: 0,
            padding: "8px 10px",
            fontSize: 11,
          }}
          value={newTrack}
          onChange={e => setNewTrack(e.target.value)}
        >
          <option value="">المسار</option>
          {TRACKS.map(track => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
        <select
          style={{
            ...styles.input,
            margin: 0,
            padding: "8px 10px",
            fontSize: 11,
          }}
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
        >
          <option value="">المجال</option>
          {data.domains
            .filter(domain => domain.track === newTrack)
            .map(domain => (
              <option key={domain.id} value={domain.name}>
                {domain.name}
              </option>
            ))}
        </select>
        <input
          style={{
            ...styles.input,
            margin: 0,
            padding: "8px 10px",
            fontSize: 11,
          }}
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="العنوان داخل المجال"
          onKeyDown={e => e.key === "Enter" && addPlanItem()}
        />
        <button
          style={{
            ...styles.smallGhostBtn,
            background: "#2563EB",
            borderColor: "#2563EB",
            color: "#FFFFFF",
          }}
          onClick={addPlanItem}
        >
          <Plus size={15} />
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 11,
        }}
      >
        {items.length ? (
          items.map(item => {
            const progress = progressFor(item);
            const linkedAnnual = activePlan === "quarterly";
            const complete = progress >= 100;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggedItemId(item.id)}
                onDragOver={event => event.preventDefault()}
                onDrop={() => reorderItems(item.id)}
                onDragEnd={() => setDraggedItemId(null)}
                style={{
                  background: `linear-gradient(90deg, ${currentLevel.color}18 ${progress}%, ${COLORS.surface2} ${progress}%)`,
                  border: `1px solid ${currentLevel.color}35`,
                  borderRadius: 11,
                  padding: "10px 11px",
                  cursor: draggedItemId === item.id ? "grabbing" : "grab",
                  opacity: draggedItemId === item.id ? 0.62 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    aria-label={
                      complete ? "إلغاء إتمام المهمة" : "إتمام المهمة"
                    }
                    onClick={() =>
                      updateItemEverywhere(item.id, {
                        progress: complete ? 0 : 100,
                      })
                    }
                    style={{
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: 8,
                      border: `1px solid ${complete ? currentLevel.color : COLORS.border}`,
                      background: complete
                        ? `${currentLevel.color}22`
                        : COLORS.surface,
                      color: complete ? currentLevel.color : COLORS.textDim,
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    {complete ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          border: `1px solid ${COLORS.textDim}`,
                          borderRadius: 3,
                        }}
                      />
                    )}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: currentLevel.color,
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    >
                      {item.domain}
                    </div>
                    <input
                      style={{
                        ...styles.statusInput,
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: COLORS.text,
                        textDecoration: complete ? "line-through" : "none",
                      }}
                      value={item.title}
                      onChange={e =>
                        updateItemEverywhere(item.id, { title: e.target.value })
                      }
                    />
                    <div
                      style={{
                        color: COLORS.textDim,
                        fontSize: 9.5,
                        marginTop: 3,
                      }}
                    >
                      {linkedAnnual
                        ? "تقدم هذا الربع ينعكس تلقائيًا على الخطة السنوية"
                        : activePlan === "annual" &&
                            (planItems.quarterly || []).some(
                              quarter => quarter.parentDomain === item.domain
                            )
                          ? "التقدم محسوب من الخطة الربع سنوية"
                          : "اضغط مربع الإنجاز عند إتمام العنوان"}
                    </div>
                  </div>
                  <strong style={{ color: currentLevel.color, fontSize: 15 }}>
                    {progress}%
                  </strong>
                  <button
                    style={styles.smallGhostBtn}
                    onClick={() => deleteItemEverywhere(item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button type="button" style={styles.smallGhostBtn} onClick={() => movePlanItem(item.id, -1)} aria-label="تحريك المهمة لأعلى" title="تحريك لأعلى">↑</button>
                  <button type="button" style={styles.smallGhostBtn} onClick={() => movePlanItem(item.id, 1)} aria-label="تحريك المهمة لأسفل" title="تحريك لأسفل">↓</button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progress}
                  disabled={
                    activePlan === "annual" &&
                    (planItems.quarterly || []).some(
                      quarter => quarter.parentDomain === item.domain
                    )
                  }
                  onChange={e =>
                    updateItemEverywhere(item.id, {
                      progress: Number(e.target.value),
                    })
                  }
                  style={{
                    width: "100%",
                    accentColor: currentLevel.color,
                    marginTop: 7,
                    direction: "ltr",
                  }}
                />
              </div>
            );
          })
        ) : (
          <div style={styles.emptyCard}>
            أضف أول مجال وعنوان إلى {currentLevel.label}.
          </div>
        )}
      </div>
    </section>
  );
}

function AnnualHoursAllocationInput({ item, onSave }) {
  const [value, setValue] = useState(String(item.hours ?? 0));
  useEffect(() => setValue(String(item.hours ?? 0)), [item.id, item.hours]);
  const save = () => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) onSave(item, numeric);
    else setValue(String(item.hours ?? 0));
  };
  return (
    <input
      type="number"
      min="0"
      step="0.5"
      value={value}
      aria-label={`الساعات السنوية لمجال ${item.domain}`}
      onChange={event => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={event => event.key === "Enter" && event.currentTarget.blur()}
      style={{ width: 76, padding: "5px 7px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.surface2, color: COLORS.text, textAlign: "center", fontSize: 11 }}
    />
  );
}

function DedicatedPlanPage({ data, persist, nav, goto, userId = null }) {
  const isQuarterly = nav.planKey === "quarterly";
  const [activeQuarter, setActiveQuarter] = useState("q1");
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [domainName, setDomainName] = useState("");
  const [description, setDescription] = useState("");
  const [annualDomainIds, setAnnualDomainIds] = useState([]);
  const [hours, setHours] = useState("");
  const planItems = data.meta.planItems || DEFAULT_PLAN_ITEMS;
  const availableAnnualDomains = planItems.annual || [];
  const currentItems = (
    planItems[isQuarterly ? "quarterly" : "annual"] || []
  ).filter(item => !isQuarterly || (item.quarter || "q1") === activeQuarter);
  const orderedCurrentItems = isQuarterly
    ? currentItems
    : sortPlanItemsByTrack(currentItems, TRACKS.map(track => track.id));
  const selectedQuartersFor = annualItem =>
    quarterlySelectionsForAnnualItem(annualItem, planItems.quarterly || [], QUARTER_TABS);
  const quarterlySelectionCount = annualItem =>
    currentItems.filter(item =>
      quarterlySelectionsForAnnualItem(annualItem, [item], QUARTER_TABS).length
    ).length;
  const selectionLabel = count =>
    count === 1 ? "تم اختيارها مرة" : count === 2 ? "تم اختيارها مرتين" : count === 3 ? "تم اختيارها 3 مرات" : `تم اختيارها ${count} مرة`;
  const annualHoursTotal = totalAnnualHours(planItems.annual || []);
  const color = isQuarterly ? "#5B8DEF" : "#8B7CFF";
  const title = isQuarterly ? "الخطة الربع سنوية" : "الخطة السنوية";
  const quarterIndex = QUARTER_TABS.findIndex(item => item.key === activeQuarter);
  const currentQuarterIndex = Math.floor(new Date().getMonth() / 3);
  const quarterEnded = isQuarterly && quarterIndex < currentQuarterIndex;
  const commitEntry = () => {
    if (quarterEnded) {
      notifyApp("هذا الربع انتهى، لا يمكن إضافة اختيار جديد");
      return;
    }
    const annualParents = isQuarterly
      ? selectPlanItemsByIds(planItems.annual || [], annualDomainIds)
      : [];
    const annualParent = annualParents[0];
    const domain = isQuarterly ? annualParent?.domain || "" : domainName.trim();
    const selectedTrack = isQuarterly ? annualParent?.track : trackId;
    const numericHours = isQuarterly
      ? Number(annualParent?.hours || 0)
      : Number(hours);
    if (
      !domain ||
      !Number.isFinite(numericHours) ||
      (!isQuarterly && numericHours <= 0)
    )
      return;
    const level = isQuarterly ? "quarterly" : "annual";
    const duplicate = (planItems[level] || []).some(
      item =>
        (isQuarterly
          ? item.parentAnnualId === annualParent?.id ||
            (!item.parentAnnualId &&
              item.parentDomain === domain &&
              item.track === selectedTrack)
          : item.domain.trim().toLowerCase() === domain.toLowerCase()) &&
        (!isQuarterly || (item.quarter || "q1") === activeQuarter)
    );
    if (duplicate && !isQuarterly) {
      return;
    }
    const entries = isQuarterly
      ? createQuarterlyPlanItems(
          annualParents,
          activeQuarter,
          parent => Number(parent.hours || 0),
          `${level}-${Date.now()}`,
        )
      : [{
          id: `${level}-${Date.now()}`,
          track: trackId,
          domain,
          description: description.trim(),
          title: domain,
          progress: 0,
          hours: numericHours,
        }];
    const normalizedDomain = domain.toLowerCase();
    const matchingPath = data.domains.find(
      item =>
        item.track === selectedTrack &&
        String(item.name || "")
          .trim()
          .toLowerCase() === normalizedDomain
    );
    const nextDomains = isQuarterly
      ? data.domains
      : matchingPath
        ? data.domains.map(item =>
            item.id === matchingPath.id
              ? { ...item, description: description.trim() }
              : item
          )
        : [
          ...data.domains,
          {
            id: uid(),
            track: selectedTrack,
            name: domain,
            description: description.trim(),
            plan: `الخطة السنوية — ${numericHours} ساعة`,
            hours: numericHours,
            quarter: null,
            createdAt: todayISO(),
            subtopics: [
              {
                ...emptySubtopic("الخطة"),
                isRoadmap: true,
              },
            ],
          },
        ];
    persist({
      ...data,
      domains: nextDomains,
      meta: {
        ...data.meta,
        planItems: {
          ...planItems,
          [level]: [...entries, ...(planItems[level] || [])],
        },
      },
    });
    setDomainName("");
    setDescription("");
    setAnnualDomainIds([]);
    setHours("");
    notifyApp(
      isQuarterly
        ? "تمت الإضافة إلى الخطة الربع سنوية"
        : "تمت إضافة المجال إلى الخطة السنوية"
    );
  };
  const addEntry = () => {
    const numericHours = Number(hours);
    if (isQuarterly) {
      if (!annualDomainIds.length) return;
    } else if (
      !domainName.trim() ||
      !description.trim() ||
      !Number.isFinite(numericHours) ||
      numericHours <= 0
    ) {
      return;
    }
    commitEntry();
  };
  const removeEntry = entry => {
    if (isQuarterly) {
      confirmDelete(`اختيار ${entry.domain} من ${QUARTER_TABS.find(item => item.key === activeQuarter)?.label}`, () => {
        persist({
          ...data,
          meta: {
            ...data.meta,
            planItems: {
              ...planItems,
              quarterly: (planItems.quarterly || []).filter(item => item.id !== entry.id),
            },
          },
        });
        notifyApp("تم حذف الاختيار من الربع الحالي");
      });
      return;
    }
    confirmDelete(`مجال ${entry.domain} وكل الخطط المرتبطة به`, () => {
      const { planItems: nextPlanItems, weekTasks } = removeAnnualDomainTree(
        planItems,
        data.meta.weekTasks || [],
        entry.id
      );
      const normalizedDomain = String(entry.domain || "")
        .trim()
        .toLowerCase();
      const legacyDailyPlan = Array.isArray(data.meta.dailyPlan)
        ? data.meta.dailyPlan
        : [];
      const annualPlanDetails = Array.isArray(data.meta.annualPlanDetails)
        ? data.meta.annualPlanDetails
        : [];
      const matchingDomainIds = new Set(
        data.domains
          .filter(
            domain =>
              domain.track === entry.track &&
              String(domain.name || "").trim().toLowerCase() === normalizedDomain
          )
          .map(domain => domain.id)
      );
      persist({
        ...data,
        domains: data.domains.filter(domain => !matchingDomainIds.has(domain.id)),
        meta: {
          ...data.meta,
          dailyPlan: legacyDailyPlan.filter(
            item => !matchingDomainIds.has(item.domainId)
          ),
          annualPlanDetails: annualPlanDetails.filter(
            item =>
              String(item.domain || "").trim().toLowerCase() !== normalizedDomain
          ),
          planItems: nextPlanItems,
          weekTasks,
        },
      });
      notifyApp("تم حذف المجال وخططه التابعة من الخطة السنوية");
    });
  };
  const updateAnnualHours = (entry, hoursValue) => {
    const normalizedHours = Math.max(0, Number(hoursValue) || 0);
    const sameDomain = candidate =>
      candidate.track === entry.track &&
      String(candidate.domain || "").trim().toLowerCase() ===
        String(entry.domain || "").trim().toLowerCase();
    const annual = (planItems.annual || []).map(item =>
      item.id === entry.id ? { ...item, hours: normalizedHours } : item
    );
    const quarterly = (planItems.quarterly || []).map(item =>
      item.parentAnnualId === entry.id || (!item.parentAnnualId && sameDomain(item))
        ? { ...item, hours: normalizedHours }
        : item
    );
    const domains = data.domains.map(domain =>
      domain.track === entry.track &&
      String(domain.name || "").trim().toLowerCase() ===
        String(entry.domain || "").trim().toLowerCase()
        ? {
            ...domain,
            hours: normalizedHours,
            plan: `الخطة السنوية — ${normalizedHours} ساعة`,
          }
        : domain
    );
    persist({
      ...data,
      domains,
      meta: { ...data.meta, planItems: { ...planItems, annual, quarterly } },
    });
  };
  return (
    <div style={styles.page}>
      <button
        style={styles.backRow}
        onClick={() => goto({ screen: "dashboard", planKey: null })}
      >
        <ChevronRight size={18} /> العودة للرئيسية
      </button>
      <section
        style={{ ...styles.goalTabs, marginTop: 8, borderColor: `${color}55` }}
      >
        <div
          style={{
            padding: "18px 16px",
            background: `linear-gradient(135deg, ${color}18, transparent)`,
          }}
        >
          <div style={{ color, fontSize: 11, fontWeight: 800 }}>
            صفحة التخطيط
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 5 }}>
            <h1
              style={{
                margin: 0,
                color: COLORS.text,
                fontFamily: FONT_HEAD,
                fontSize: 22,
              }}
            >
              {title}
            </h1>
            {!isQuarterly && (
              <div
                aria-live="polite"
                className="annualHoursSummary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 11px", border: `1px solid ${color}55`, borderRadius: 12, background: `${color}14`, color: COLORS.text }}
              >
                <Clock3 size={15} color={color} />
                <span style={{ color: COLORS.textDim, fontSize: 10 }}>إجمالي الساعات المحددة</span>
                <strong style={{ color, fontSize: 14 }}>{annualHoursTotal} ساعة</strong>
              </div>
            )}
          </div>
          <p style={{ color: COLORS.textDim, fontSize: 11, margin: "7px 0 0" }}>
            {isQuarterly
              ? "اختر مجالًا من الخطة السنوية لربطه بالربع الحالي. المجالات لا تُنشأ إلا من الخطة السنوية."
              : "أضف المجالات السنوية هنا؛ وستظهر لاختيارها في الخطط الربع سنوية والشهرية والأسبوعية."}
          </p>
        </div>
        {!isQuarterly && (
          <div style={{ display: "grid", gap: 6, padding: "0 11px 11px" }}>
            <div style={{ color: COLORS.textDim, fontSize: 10 }}>المرحلة ١ من ٤ · بعد تحديد المجالات السنوية</div>
            <button
              type="button"
              onClick={() => goto({ screen: "planPage", planKey: "quarterly", domainId: null, subtopicId: null })}
              style={{ ...styles.primaryBtn, background: "#5B8DEF", color: "#07111F" }}
            >
              <ChevronLeft size={16} /> الخطوة التالية: الانتقال إلى الخطة الربع سنوية
            </button>
          </div>
        )}
        {isQuarterly && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 7,
              padding: 11,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {QUARTER_TABS.map(quarter => (
              <button
                key={quarter.key}
                type="button"
                onClick={() => setActiveQuarter(quarter.key)}
                style={{
                  ...styles.goalTabButton,
                  color: activeQuarter === quarter.key ? color : COLORS.textDim,
                  borderColor:
                    activeQuarter === quarter.key
                      ? `${color}66`
                      : "transparent",
                  background:
                    activeQuarter === quarter.key
                      ? `${color}12`
                      : "transparent",
                }}
              >
                {quarter.label}
              </button>
            ))}
          </div>
        )}
        {isQuarterly && (
          <div style={{ display: "grid", gap: 6, padding: "0 11px 11px" }}>
            <div style={{ color: COLORS.textDim, fontSize: 10 }}>المرحلة ١ من ٤ · الأهداف الربع سنوية</div>
            <button
              type="button"
              onClick={() => {
                const quarterStartMonth = Math.max(0, quarterIndex) * 3;
                const focusDate = formatLocalCalendarDate(
                  new Date(new Date().getFullYear(), quarterStartMonth, 1)
                );
                goto({ screen: "planWorkspace", planKey: "monthly", focusDate, domainId: null, subtopicId: null });
              }}
              style={{ ...styles.primaryBtn, background: COLORS.teal, color: "#071311" }}
            >
              <ChevronLeft size={16} /> الخطوة التالية: توزيع أهداف هذا الربع على الأشهر
            </button>
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isQuarterly
              ? "minmax(0, 1fr) auto"
              : "minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1.7fr) 120px auto",
            gap: 8,
            padding: 12,
          }}
        >
          {!isQuarterly ? (
            <>
              <select
                style={{ ...styles.input, margin: 0 }}
                value={trackId}
                onChange={e => setTrackId(e.target.value)}
                aria-label="مسار المجال السنوي"
              >
                {TRACKS.map(track => (
                  <option key={track.id} value={track.id}>
                    {track.label}
                  </option>
                ))}
              </select>
              <input
                style={{ ...styles.input, margin: 0 }}
                value={domainName}
                onChange={e => setDomainName(e.target.value)}
                placeholder="المجال — مثل البرمجة"
                onKeyDown={e => e.key === "Enter" && addEntry()}
              />
              <RichTextEditor
                style={{ ...styles.input, margin: 0, minHeight: 54, resize: "vertical" }}
                value={description}
                onChange={setDescription}
                placeholder="اكتب ما الذي تريد الوصول إليه في هذا المجال"
                ariaLabel="وصف هدف المجال السنوي"
                minHeight={54}
              />
            </>
          ) : (
            <details aria-label="مجالات من الخطة السنوية" style={{ ...styles.input, margin: 0, padding: 7, opacity: quarterEnded ? 0.55 : 1 }}>
              <summary style={{ color: COLORS.textDim, fontSize: 10, padding: "0 3px 3px", cursor: "pointer" }}>اختر مجالًا أو أكثر من الخطة السنوية</summary>
              {availableAnnualDomains.length ? availableAnnualDomains.map(item => (
                <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, background: annualDomainIds.includes(item.id) ? "#5B8DEF18" : COLORS.surface2, border: `1px solid ${annualDomainIds.includes(item.id) ? "#5B8DEF66" : COLORS.border}`, color: COLORS.text, fontSize: 11, cursor: quarterEnded ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" checked={annualDomainIds.includes(item.id)} disabled={quarterEnded} onChange={() => setAnnualDomainIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />
                  <span>{item.domain}</span>
                  <small style={{ marginInlineStart: "auto", color: COLORS.textDim, fontSize: 9 }}>{selectedQuartersFor(item).length ? `مختار في ${selectedQuartersFor(item).map(quarter => quarter.label).join("، ")}` : "غير مختار"}</small>
                </label>
              )) : <span style={{ color: COLORS.textDim, fontSize: 10 }}>أضف مجالات في الخطة السنوية أولًا.</span>}
            </details>
          )}
          {isQuarterly && annualDomainIds.length > 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                color: COLORS.textDim,
                fontSize: 10,
                padding: "2px 4px 0",
              }}
            >
              {(() => {
                const selectedAnnualDomains = availableAnnualDomains.filter(item => annualDomainIds.includes(item.id));
                const selectedQuarters = selectedAnnualDomains.flatMap(item => selectedQuartersFor(item));
                return selectedQuarters.length
                  ? `تم اختيار ${annualDomainIds.length} مجال — موجود حاليًا في: ${selectedQuarters.map(quarter => quarter.label).join("، ")}`
                  : `تم اختيار ${annualDomainIds.length} مجال ولم يُربط أي منها بربع بعد`;
              })()}
            </div>
          )}
          {!isQuarterly && (
            <input
              style={{ ...styles.input, margin: 0 }}
              type="number"
              min="0"
              step="0.5"
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="الساعات السنوية"
            />
          )}
          <button
            type="button"
            style={{
              ...styles.primaryBtn,
              background: "#2563EB",
              color: "#FFFFFF",
              padding: "8px 12px",
            }}
            onClick={addEntry}
            disabled={
              isQuarterly
                ? quarterEnded || !annualDomainIds.length
                : !domainName.trim() || !hours || Number(hours) <= 0
            }
          >
            <Plus size={15} /> إضافة
          </button>
        </div>
        <div style={{ display: "grid", gap: 8, padding: "0 12px 14px" }}>
          {orderedCurrentItems.length ? (
            orderedCurrentItems.map((item, index) => {
              const linkedDomain = !isQuarterly
                ? data.domains.find(
                    domain =>
                      domain.track === item.track &&
                      String(domain.name || "").trim().toLowerCase() ===
                        String(item.domain || "").trim().toLowerCase()
                  )
                : null;
              const track = TRACKS.find(candidate => candidate.id === item.track);
              const showTrackHeading =
                !isQuarterly &&
                (index === 0 || orderedCurrentItems[index - 1]?.track !== item.track);
              return (
              <React.Fragment key={item.id}>
                {showTrackHeading && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      margin: index === 0 ? "2px 2px 0" : "12px 2px 0",
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: `${track?.accent || color}16`,
                      border: `1px solid ${track?.accent || color}44`,
                      color: track?.accent || color,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: track?.accent || color,
                      }}
                    />
                    {track?.label || "مسار غير محدد"}
                    <span style={{ marginInlineStart: "auto", color: COLORS.textDim, fontSize: 9 }}>
                      {orderedCurrentItems.filter(candidate => candidate.track === item.track).length} مجال
                    </span>
                  </div>
                )}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  padding: "11px 12px",
                  border: `1px solid ${color}44`,
                  borderRadius: 11,
                  background: `${color}09`,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    background:
                      TRACKS.find(track => track.id === item.track)?.accent ||
                      color,
                  }}
                />
                <div
                  style={{
                    flex: 1,
                    color: COLORS.text,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {item.domain}
                  {item.description && (
                    <RichTextDisplay
                      value={item.description}
                      style={{
                        display: "block",
                        marginTop: 4,
                        color: COLORS.textDim,
                        fontWeight: 400,
                        lineHeight: 1.5,
                        fontSize: 10,
                      }}
                    >
                    </RichTextDisplay>
                  )}
                  {!isQuarterly && linkedDomain && (
                    <AnnualDomainProgress
                      domainId={linkedDomain.id}
                      domainName={item.domain}
                      goalHours={item.hours}
                      studySessions={data.meta.studySessions || []}
                      userId={userId}
                    />
                  )}
                </div>
                {!isQuarterly && (
                  <div style={{ display: "grid", justifyItems: "center", gap: 4, flex: "0 0 auto" }}>
                    <span style={{ color: COLORS.textDim, fontSize: 9.5 }}>ساعة سنويًا</span>
                    <AnnualHoursAllocationInput item={item} onSave={updateAnnualHours} />
                  </div>
                )}
                <button
                  type="button"
                  style={styles.smallGhostBtn}
                  onClick={() => removeEntry(item)}
                  aria-label={`حذف ${item.domain} من ${isQuarterly ? "الربع الحالي" : "الخطة السنوية"}`}
                  title={isQuarterly ? "حذف هذا الاختيار من الربع الحالي" : "الحذف من الخطة السنوية فقط"}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              </React.Fragment>
              );
            })
          ) : (
            <div style={styles.emptyCard}>
              لم تُضف مجالات إلى{" "}
              {isQuarterly
                ? QUARTER_TABS.find(quarter => quarter.key === activeQuarter)
                    ?.label
                : "الخطة السنوية"}{" "}
              بعد.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DomainExperiencePanel({ domain, track, data, persist }) {
  const [open, setOpen] = useState(true);
  const [selectedAction, setSelectedAction] = useState(domain.workspace?.lastAction || "");
  const defaults = {
    professional: ["حدد النتيجة المهنية", "تعلم المهارة المطلوبة", "طبّقها في مشروع", "أنشئ دليل إنجاز"],
    personal: ["افهم ما تريده", "اختر عادة صغيرة", "جرّبها أسبوعًا", "ثبّت ما نفع"],
    social: ["افهم العلاقة", "اختر طريقة تواصل", "طبّق موقفًا", "راجع الأثر"],
    academic: ["ابنِ الأساس", "افهم الفكرة", "حل أسئلة", "راجع قبل الاختبار"],
    spiritual: ["حدد نيتك", "اقرأ وتأمل", "مارس بهدوء", "استمر بلا ضغط"],
    books: ["اختر كتابًا", "اقرأ بتركيز", "استخرج المعنى", "طبّق فكرة"],
    languages: ["ابنِ الأساس", "استمع واقرأ", "تحدث واكتب", "راجع حتى الإتقان"],
  }[track.id] || ["ابدأ", "تعلّم", "طبّق", "راجع"];
  const workspace = { goal: "", status: "started", weeklyReflection: "", plan: defaults, ...(domain.workspace || {}) };
  const completedCount = domain.subtopics.filter(sub => isTitleTaskComplete(data, domain, sub)).length;
  const progress = domain.subtopics.length ? Math.round((completedCount / domain.subtopics.length) * 100) : 0;
  const statusLabels = { started: "لم يبدأ", progressing: "يتقدم", review: "يحتاج مراجعة", mastered: "متقن" };
  const updateWorkspace = patch => persist({ ...data, domains: data.domains.map(item => item.id === domain.id ? { ...item, workspace: { ...workspace, ...patch } } : item) });
  const stageDone = index => progress >= [15, 40, 70, 100][index];
  const actionIndex = Math.max(0, workspace.plan.indexOf(selectedAction));
  const actionGuide = selectedAction ? {
    professional: ["اكتب النتيجة التي تريد الوصول إليها بصيغة قابلة للقياس.", "اختر مصدرًا واحدًا وخصص له جلسة قصيرة.", "نفّذ نسخة صغيرة من المهارة داخل مشروع حقيقي."][actionIndex],
    academic: ["حدد ما الذي تريد فهمه من الوحدة.", "اشرح الفكرة بكلماتك ثم قارنها بالمصدر.", "حل سؤالًا أو تمرينًا وسجل الخطأ إن وجد."][actionIndex],
    books: ["اكتب سبب قراءة الكتاب في سطر واحد.", "اقرأ عددًا صغيرًا من الصفحات وسجل فكرة واحدة.", "حوّل فكرة من الكتاب إلى تجربة هذا الأسبوع."][actionIndex],
    languages: ["حدد موقفًا ستستخدم فيه اللغة.", "استمع أو اقرأ مادة قصيرة ثم استخرج 3 كلمات.", "تحدث أو اكتب جملًا باستخدام الكلمات الجديدة."][actionIndex],
  }[track.id]?.trim() : "";
  return <section className="domainExperiencePanel" style={{ borderColor: `${track.accent}44` }}>
    <button type="button" className="domainExperienceHeader domainExperienceToggle" onClick={() => setOpen(value => !value)} aria-expanded={open}><div><span className="domainExperienceEyebrow"><Target size={13} /> خريطة المجال</span><h3>ماذا تريد أن تحقق في {domain.name}؟</h3></div><span className="domainExperienceChevron">{open ? "⌃" : "⌄"}</span></button>
    {open && <>
    <div className="domainExperienceStatus"><select value={workspace.status} onChange={event => updateWorkspace({ status: event.target.value })} aria-label="حالة المجال" style={{ ...styles.input, width: 130, margin: 0, color: track.accent }}><option value="started">لم يبدأ</option><option value="progressing">يتقدم</option><option value="review">يحتاج مراجعة</option><option value="mastered">متقن</option></select></div>
    <textarea value={workspace.goal || ""} onChange={event => updateWorkspace({ goal: event.target.value })} placeholder={`اكتب هدفًا واضحًا لهذا المجال — مثل: أستطيع ${track.id === "languages" ? "التحدث 10 دقائق" : "تطبيق ما أتعلمه في موقف حقيقي"}`} rows={2} className="domainGoalInput" />
    <div className="domainJourneyMap">{workspace.plan.map((step, index) => <div key={`${step}-${index}`} className={`domainJourneyStep ${stageDone(index) ? "is-done" : ""}`}><span>{stageDone(index) ? "✓" : index + 1}</span><strong>{step}</strong><small>{stageDone(index) ? "مكتمل" : index === 0 ? "الخطوة اللي بعدها" : "لاحقًا"}</small></div>)}</div>
    <div className="domainNextActions"><div className="domainSubheading">ماذا تفعل الآن؟</div>{workspace.plan.slice(0, 3).map((step, index) => <button key={`${step}-action`} type="button" aria-pressed={selectedAction === step} onClick={() => { setSelectedAction(step); updateWorkspace({ lastAction: step, lastActionAt: new Date().toISOString() }); }}><span>{index + 1}</span><strong>{step}</strong><ChevronLeft size={14} /></button>)}</div>
    {selectedAction && <div className="domainActionGuide"><div><Sparkles size={15} color={track.accent} /><strong>الخطوة المختارة: {selectedAction}</strong></div><p>{actionGuide || "حوّل هذه الخطوة إلى فعل صغير الآن: اكتب، طبّق، أو افتح عنوانًا مرتبطًا بها."}</p><textarea value={workspace.actionNotes?.[selectedAction] || ""} onChange={event => updateWorkspace({ actionNotes: { ...(workspace.actionNotes || {}), [selectedAction]: event.target.value } })} placeholder={`اكتب هنا ما ستفعله في خطوة «${selectedAction}»…`} rows={4} className="domainActionInput" /><small>يتم حفظ ما تكتبه تلقائيًا داخل هذا المجال.</small></div>}
    <div className="domainEvidenceRow"><div><strong>{progress}%</strong><small>تقدم المجال</small></div><div><strong>{completedCount}</strong><small>تطبيقات مكتملة</small></div><div><strong>{domain.subtopics.length}</strong><small>عناوين في المسار</small></div><div><strong>{statusLabels[workspace.status]}</strong><small>الحالة الحالية</small></div></div>
    <div className="domainWeeklyReview"><div className="domainSubheading">مراجعة هذا الأسبوع</div><textarea value={workspace.weeklyReflection || ""} onChange={event => updateWorkspace({ weeklyReflection: event.target.value })} placeholder="ما الذي تعلمته؟ ماذا طبقت؟ وما الخطوة القادمة؟" rows={3} className="domainGoalInput" /></div>
    </>}
  </section>;
}

function DomainsScreen({ data, persist, nav, goto, goBack, isAuthenticated, userId = null }) {
  const activeTrack = nav.track || TRACKS[0].id;
  const track = TRACKS.find(t => t.id === activeTrack);
  const today = todayISO();
  const domains = data.domains.filter(d => d.track === activeTrack);

  const activeDomain = nav.domainId
    ? domains.find(domain => domain.id === nav.domainId) || null
    : null;
  const activeDomainSubtopics = activeDomain?.subtopics || [];
  const activeDomainCompletedCount = activeDomainSubtopics.filter(sub =>
    isTitleTaskComplete(data, activeDomain, sub)
  ).length;
  const activeDomainCompletionPercent = activeDomainSubtopics.length
    ? Math.round((activeDomainCompletedCount / activeDomainSubtopics.length) * 100)
    : 0;
  const normalizedDomainName = value => String(value || "").trim().toLowerCase();
  const todayTaskDomains = new Set(
    [
      ...(data.meta.planItems?.daily || []).map(item => ({
        ...item,
        taskDate: item.date || item.plannedDate || item.scheduledDate || today,
      })),
      ...(data.meta.weekTasks || []).map(task => ({
        ...resolveScheduledTask(data, task),
        taskDate: getWeekTaskDate(task) || task.plannedDate || today,
      })),
    ]
      .filter(item =>
        String(item.taskDate).slice(0, 10) === today &&
        !isReviewItem(item) &&
        !isPlanItemComplete(item)
      )
      .flatMap(item => [normalizedDomainName(item.domain), String(item.domainId || "")])
      .filter(Boolean)
  );
  const [branchName, setBranchName] = useState("");
  const [editingSubtopicId, setEditingSubtopicId] = useState(null);
  const [editingSubtopicTitle, setEditingSubtopicTitle] = useState("");
  const [collapsedBranchIds, setCollapsedBranchIds] = useState({});
  useEffect(() => setCollapsedBranchIds({}), [activeDomain?.id]);
  const activeBranches = Array.isArray(activeDomain?.branches)
    ? activeDomain.branches
    : [];
  const visibleDomains = activeDomain ? [activeDomain] : domains;
  const annualItems = data.meta.planItems?.annual || [];
  const trackHours = domains.reduce((total, domain) => {
    const annualItem = annualItems.find(
      item => item.track === domain.track &&
        String(item.domain || "").trim().toLowerCase() === String(domain.name || "").trim().toLowerCase()
    );
    return total + Number(domain.hours ?? annualItem?.hours ?? 0);
  }, 0);
  const createDomainBranch = () => {
    const name = branchName.trim();
    if (!activeDomain || !name) {
      notifyApp("اكتب اسم الفرع أولًا");
      return;
    }
    if (activeBranches.some(branch => branch.name.trim().toLowerCase() === name.toLowerCase())) {
      notifyApp("هذا الفرع موجود بالفعل داخل المجال");
      return;
    }
    const branch = {
      id: `domain-branch-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
    };
    persist({
      ...data,
      domains: data.domains.map(domain =>
        domain.id === activeDomain.id
          ? { ...domain, branches: [...activeBranches, branch] }
          : domain
      ),
    });
    setBranchName("");
    notifyApp(`تم إنشاء فرع «${name}»`);
  };
  const assignSubtopicBranch = (subtopicId, branchId) => {
    if (!activeDomain) return;
    persist({
      ...data,
      domains: data.domains.map(domain =>
        domain.id !== activeDomain.id
          ? domain
          : {
              ...domain,
              subtopics: domain.subtopics.map(subtopic =>
                subtopic.id === subtopicId
                  ? { ...subtopic, branchId: branchId || null }
                  : subtopic
              ),
            }
      ),
    });
  };
  const setSubtopicKind = (subtopicId, kind) => persist({
    ...data,
    domains: data.domains.map(domain => domain.id !== activeDomain?.id ? domain : {
      ...domain,
      subtopics: domain.subtopics.map(subtopic => subtopic.id === subtopicId ? { ...subtopic, kind } : subtopic),
    }),
  });
  const startSubtopicEdit = subtopic => {
    setEditingSubtopicId(subtopic.id);
    setEditingSubtopicTitle(subtopic.titleHtml || subtopic.title || "");
  };
  const cancelSubtopicEdit = () => {
    setEditingSubtopicId(null);
    setEditingSubtopicTitle("");
  };
  const saveSubtopicTitle = subtopicId => {
    const title = richTextToPlainText(editingSubtopicTitle).trim();
    const titleHtml = sanitizeRichTextHTML(editingSubtopicTitle);
    if (!title) {
      notifyApp("اكتب عنوانًا صحيحًا أولًا");
      return;
    }
    persist({
      ...data,
      domains: data.domains.map(domain => ({
        ...domain,
        subtopics: domain.subtopics.map(subtopic =>
          subtopic.id === subtopicId ? { ...subtopic, title, titleHtml } : subtopic
        ),
      })),
      meta: {
        ...data.meta,
        weekTasks: (data.meta.weekTasks || []).map(task =>
          task.subtopicId === subtopicId ? { ...task, title, titleHtml } : task
        ),
      },
    });
    cancelSubtopicEdit();
    notifyApp("تم تعديل عنوان التعلم");
  };
  const deleteDomainBranch = (branchId, branchName) => {
    if (!activeDomain || !branchId) return;
    const assignedCount = activeDomain.subtopics.filter(
      subtopic => subtopic.branchId === branchId
    ).length;
    if (
      !confirmDelete(`الفرع «${branchName}»`, () => {
        persist({
          ...data,
          domains: data.domains.map(domain =>
            domain.id !== activeDomain.id
              ? domain
              : {
                  ...domain,
                  branches: (domain.branches || []).filter(
                    branch => branch.id !== branchId
                  ),
                  // Keep the titles; deleting a branch only moves them back
                  // to the unassigned section.
                  subtopics: domain.subtopics.map(subtopic =>
                    subtopic.branchId === branchId
                      ? { ...subtopic, branchId: null }
                      : subtopic
                  ),
                }
          ),
        });
        notifyApp(
          assignedCount
            ? `تم حذف الفرع ونقل ${assignedCount} عنوان إلى «عناوين بدون فرع»`
            : `تم حذف الفرع «${branchName}»`
        );
      })
    )
      return;
  };
  const toggleBranch = branchId =>
    setCollapsedBranchIds(current => ({
      ...current,
      [branchId]: !current[branchId],
    }));

  return (
    <div className={`workspacePage ${activeDomain ? "domainFocusWorkspace" : ""}`} style={styles.page}>
      {activeDomain ? (
        <div className="workspaceDetailHeader">
          <div className="workspaceBreadcrumb">المسارات / {track.label} / المجال</div>
          <h1 className="domainTitleProgressRow">
            <span>{activeDomain.name}</span>
            <span
              className="domainCompletionBadge"
              role="progressbar"
              aria-label={`نسبة إنجاز مجال ${activeDomain.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={activeDomainCompletionPercent}
              title={`${activeDomainCompletedCount} من ${activeDomainSubtopics.length} عنوان مكتمل`}
            >
              {activeDomainCompletionPercent}٪ مكتمل
            </span>
          </h1>
          <p>{activeDomain.description || `مساحة العمل الخاصة بمجال ${activeDomain.name} داخل مسار ${track.label}.`}</p>
          <button
            className="workspaceBackButton"
            onClick={goBack}
            aria-label="العودة إلى مجالات المسار"
            title="العودة إلى مجالات المسار"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ) : (
        <div className="trackWorkspaceHero">
          <div className="trackWorkspaceArt" aria-hidden="true">
            <img src={track.image} alt="" loading="lazy" />
          </div>
          <div className="trackWorkspaceIcon" style={{ color: track.accent, background: `${track.accent}1c` }}>
            {(() => { const Icon = track.icon; return <Icon size={28} />; })()}
          </div>
          <div className="trackWorkspaceIntro">
            <div className="workspaceBreadcrumb">مساحة العمل / المسارات الستة</div>
            <h1>مسار {track.label}</h1>
            <p>هنا تتابع مجالات المسار وعناوين التعلّم المرتبطة به.</p>
          </div>
          <div className="workspaceMetricRow">
            <div className="workspaceMetric"><strong>{domains.length}</strong><span>مجال</span></div>
            <div className="workspaceMetric"><strong>{domains.reduce((n, domain) => n + domain.subtopics.length, 0)}</strong><span>عنوان</span></div>
            <div className="workspaceMetric"><strong>{Number.isInteger(trackHours) ? trackHours : Number(trackHours.toFixed(1))}</strong><span>ساعة مستهدفة</span></div>
          </div>
        </div>
      )}
      <div className="workspaceSectionHeading">
        <div>
          <h2>{activeDomain ? "خطة المجال" : "مجالات المسار"}</h2>
          <p>{activeDomain ? "مؤقت المذاكرة والعناوين الخاصة بهذا المجال" : "افتح أي مجال لتدخل إلى مساحة العمل الكاملة الخاصة به"}</p>
        </div>
        {activeDomain && <span className="workspaceSectionBadge">{track.label}</span>}
      </div>
      <div
        style={{
          display: activeDomain ? "block" : "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 310px), 1fr))",
          alignItems: "start",
          gap: 16,
          marginTop: 6,
          paddingBottom: activeDomain ? 12 : 24,
        }}
      >
        {!activeDomain && domains.length === 0 && (
          <div style={styles.emptyCard}>
            لا توجد مجالات بعد في مسار {track.label}. أضف مجالًا من الخطة السنوية أولًا.
          </div>
        )}
        {visibleDomains.map(domain => {
          const annualAllocation = (data.meta.planItems?.annual || []).find(
            item =>
              item.track === domain.track &&
              String(item.domain || "").trim().toLowerCase() ===
                String(domain.name || "").trim().toLowerCase()
          );
          const allocatedHours = annualAllocation?.hours ?? domain.hours;
          const isOpen = activeDomain?.id === domain.id;
          const hasTodayTask = todayTaskDomains.has(normalizedDomainName(domain.name)) || todayTaskDomains.has(String(domain.id));
          const visibleSubtopics = domain.subtopics.filter(
            sub =>
              !sub.scheduledDate ||
              isCalendarDateReached(String(sub.scheduledDate).slice(0, 10), today)
          );
          const branchSections = [
            {
              key: "unassigned",
              id: null,
              name: "عناوين بدون فرع",
              items: visibleSubtopics.filter(sub => !sub.branchId),
            },
            ...(Array.isArray(domain.branches) ? domain.branches : []).map(branch => ({
              key: branch.id,
              id: branch.id,
              name: branch.name,
              items: visibleSubtopics.filter(sub => sub.branchId === branch.id),
            })),
          ].filter(section => section.items.length || section.id);
          return (
            <div key={domain.id} className={`domainWorkspaceCard ${isOpen ? "domainWorkspaceCardOpen" : ""}`} style={styles.domainCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  cursor: isOpen ? "default" : "pointer",
                }}
                role={isOpen ? undefined : "button"}
                tabIndex={isOpen ? undefined : 0}
                aria-label={isOpen ? undefined : `افتح مساحة المجال ${domain.name}`}
                onClick={() => !isOpen && goto({ screen: "domains", track: activeTrack, domainId: domain.id, subtopicId: null })}
                onKeyDown={event => {
                  if (!isOpen && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    goto({ screen: "domains", track: activeTrack, domainId: domain.id, subtopicId: null });
                  }
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: FONT_HEAD,
                      fontWeight: 700,
                      fontSize: 15.5,
                      color: COLORS.text,
                    }}
                  >
                    {hasTodayTask && (
                      <span className="domainTodayTaskIcon" title="لديك مهمة اليوم" aria-label="لديك مهمة اليوم">
                        <Bell size={13} />
                      </span>
                    )}
                    {domain.name}
                  </div>
                  {domain.description && (
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textDim,
                        marginTop: 5,
                        lineHeight: 1.7,
                        maxWidth: 560,
                      }}
                    >
                      {domain.description}
                    </div>
                  )}
                  {domain.plan && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: COLORS.textDim,
                        marginTop: 4,
                        lineHeight: 1.6,
                      }}
                    >
                      {domain.plan}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11.5,
                      color: track.accent,
                      marginTop: 6,
                    }}
                  >
                    {visibleSubtopics.length}{" "}
                    {activeTrack === "books" ? "كتاب" : "عنوان فرعي"}
                  </div>
                </div>
                <div className="domainCardActions">
                  <span>{allocatedHours || 0} ساعة</span>
                  {!isOpen && <span className="domainOpenHint">افتح مساحة المجال <ChevronLeft size={14} /></span>}
                </div>
              </div>

              {isOpen && (
                <div
                  style={{
                    marginTop: 14,
                    borderTop: `1px solid ${COLORS.border}`,
                    paddingTop: 14,
                  }}
                >
                  <DomainExperiencePanel domain={domain} track={track} data={data} persist={persist} />
                  <DomainAllocationTimer
                    key={domain.id}
                    domainId={domain.id}
                    domainName={domain.name}
                    trackId={domain.track}
                    hours={allocatedHours}
                    data={data}
                    persist={persist}
                    isAuthenticated={isAuthenticated}
                    userId={userId}
                  />
                  <div
                    style={{
                      marginBottom: 12,
                      padding: 11,
                      borderRadius: 11,
                      border: `1px solid ${track.accent}44`,
                      background: `${track.accent}0c`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                      <Layers size={15} color={track.accent} />
                      <strong style={{ color: COLORS.text, fontSize: 12 }}>فروع المجال</strong>
                    </div>
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      <input
                        value={branchName}
                        onChange={event => setBranchName(event.target.value)}
                        onKeyDown={event => event.key === "Enter" && createDomainBranch()}
                        placeholder="اسم الفرع — مثل: أساسيات"
                        aria-label="اسم فرع جديد داخل المجال"
                        style={{ ...styles.input, margin: 0, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={createDomainBranch}
                        style={{ ...styles.primaryBtn, background: track.accent, color: "#08110f", whiteSpace: "nowrap" }}
                      >
                        <Plus size={14} /> إضافة فرع
                      </button>
                    </div>
                    <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 7 }}>
                      أنشئ فرعًا ثم اختره من القائمة بجوار كل عنوان لتجميع العناوين داخله.
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {visibleSubtopics.length === 0 && domain.subtopics.length > 0 && (
                      <div style={styles.emptyCard}>
                        العناوين المجدولة ستظهر هنا عند حلول يومها.
                      </div>
                    )}
                    {branchSections.map(section => {
                      const isCollapsed = Boolean(collapsedBranchIds[section.key]);
                      return (
                        <section key={section.key} style={{ display: "grid", gap: 7 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                            <button
                              type="button"
                              onClick={() => toggleBranch(section.key)}
                              aria-expanded={!isCollapsed}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                flex: 1,
                                minWidth: 0,
                                border: `1px solid ${track.accent}33`,
                                borderRadius: 10,
                                padding: "8px 10px",
                                background: `${track.accent}0b`,
                                color: COLORS.text,
                                cursor: "pointer",
                                textAlign: "right",
                              }}
                            >
                              <Layers size={14} color={track.accent} />
                              <strong style={{ flex: 1, fontSize: 11.5 }}>{section.name}</strong>
                              <span style={{ color: COLORS.textDim, fontSize: 10 }}>{section.items.length} عنوان</span>
                              {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                            </button>
                            {section.id && (
                              <button
                                type="button"
                                onClick={() => deleteDomainBranch(section.id, section.name)}
                                aria-label={`حذف الفرع ${section.name}`}
                                title="حذف الفرع ونقل عناوينه إلى عناوين بدون فرع"
                                style={{
                                  ...styles.smallGhostBtn,
                                  color: COLORS.rose,
                                  borderColor: `${COLORS.rose}55`,
                                  padding: "0 10px",
                                  gap: 5,
                                }}
                              >
                                <Trash2 size={14} /> حذف
                              </button>
                            )}
                          </div>
                          {!isCollapsed && section.items.map(sub => (
                            <div key={sub.id} style={{ ...styles.subtopicRow, cursor: "default" }}>
                              {editingSubtopicId === sub.id ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
                                  <RichTextEditor
                                    value={editingSubtopicTitle}
                                    onChange={setEditingSubtopicTitle}
                                    onClick={event => event.stopPropagation()}
                                    onKeyDown={event => {
                                      if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        saveSubtopicTitle(sub.id);
                                      }
                                      if (event.key === "Escape") cancelSubtopicEdit();
                                    }}
                                    ariaLabel={`تعديل عنوان ${sub.title}`}
                                    accent={track.accent}
                                    toolbarEnabled
                                    compact
                                    minHeight={40}
                                    style={{ ...styles.input, flex: 1, margin: 0, minHeight: 40, padding: "5px 8px", fontSize: 12 }}
                                  />
                                  <button type="button" onClick={() => saveSubtopicTitle(sub.id)} style={{ ...styles.smallGhostBtn, color: track.accent, borderColor: `${track.accent}66`, padding: "6px 9px" }} title="حفظ التعديل">
                                    <Save size={14} /> حفظ
                                  </button>
                                  <button type="button" onClick={cancelSubtopicEdit} style={{ ...styles.smallGhostBtn, padding: "6px 8px" }} title="إلغاء التعديل">
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => goto({ screen: "lesson", domainId: domain.id, subtopicId: sub.id })}
                                  style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, border: 0, background: "transparent", color: "inherit", padding: 0, textAlign: "right", cursor: "pointer" }}
                                >
                                  <div style={{ display: "flex", gap: 2 }}>
                                    {[0, 1, 2, 3, 4].map(i => (
                                      <Star
                                        key={i}
                                        size={12}
                                        fill={i < starsFor(sub) ? track.accent : "none"}
                                        color={i < starsFor(sub) ? track.accent : COLORS.border}
                                      />
                                    ))}
                                  </div>
                                  <div style={{ flex: 1, textAlign: "right", display: "grid", gap: 3 }}>
                                    <span style={{ fontSize: 13.5, color: COLORS.text }}>{sub.title}</span>
                                    {sub.scheduledDate && <small style={{ color: COLORS.textDim, fontSize: 10 }}>مجدول: {formatArabicDate(sub.scheduledDate)}</small>}
                                  </div>
                                  {sub.dateStarted ? <Clock3 size={13} color={COLORS.textDim} /> : <span style={{ fontSize: 10.5, color: COLORS.textDim }}>لم يبدأ</span>}
                                </button>
                              )}
                              {editingSubtopicId !== sub.id && (
                                <button type="button" onClick={() => startSubtopicEdit(sub)} style={{ ...styles.smallGhostBtn, color: track.accent, borderColor: `${track.accent}55`, padding: "6px 8px" }} title="تعديل عنوان التعلم" aria-label={`تعديل عنوان ${sub.title}`}>
                                  <Pencil size={14} /> تعديل
                                </button>
                              )}
                              <select
                                value={sub.branchId || ""}
                                onChange={event => assignSubtopicBranch(sub.id, event.target.value)}
                                onClick={event => event.stopPropagation()}
                                aria-label={`فرع العنوان ${sub.title}`}
                                style={{ ...styles.input, width: 118, margin: 0, padding: "6px 7px", fontSize: 10 }}
                              >
                                <option value="">بدون فرع</option>
                                {activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                              </select>
                              <select
                                value={sub.kind || "learn"}
                                onChange={event => setSubtopicKind(sub.id, event.target.value)}
                                onClick={event => event.stopPropagation()}
                                aria-label={`نوع عنوان ${sub.title}`}
                                style={{ ...styles.input, width: 98, margin: 0, padding: "6px 7px", fontSize: 10 }}
                              >
                                <option value="learn">تعلّم</option><option value="practice">تطبيق</option><option value="review">مراجعة</option><option value="project">مشروع</option><option value="habit">عادة</option><option value="reflection">تأمل</option>
                              </select>
                            </div>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      padding: "9px 11px",
                      borderRadius: 9,
                      background: `${track.accent}10`,
                      color: COLORS.textDim,
                      fontSize: 10.5,
                    }}
                  >
                    لإضافة مهمة أو عنوان لهذا المجال، افتح الخطة الأسبوعية واختر اليوم المطلوب.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Roadmap screen: the first title created with every new domain           */
/* ---------------------------------------------------------------------- */

function RoadmapScreen({ data, persist, domain, subtopic, goto }) {
  const track = TRACKS.find(t => t.id === domain.track) || TRACKS[0];
  const updateSubtopic = updater => {
    const next = {
      ...data,
      domains: data.domains.map(item =>
        item.id !== domain.id
          ? item
          : {
              ...item,
              subtopics: item.subtopics.map(entry =>
                entry.id === subtopic.id ? updater(entry) : entry
              ),
            }
      ),
    };
    persist(next);
  };
  const setTab = (key, value) =>
    updateSubtopic(current => ({
      ...current,
      tabs: { ...current.tabs, [key]: value },
    }));

  return (
    <div style={styles.page}>
      <button
        style={styles.backRow}
        onClick={() =>
          goto({ screen: "domains", track: domain.track, domainId: domain.id })
        }
      >
        <ChevronRight size={18} />
        {domain.name}
      </button>
      <div
        style={{
          marginTop: 8,
          padding: 18,
          border: `1px solid ${track.accent}55`,
          borderRadius: 16,
          background: `linear-gradient(135deg, ${track.accent}18, transparent)`,
        }}
      >
        <div style={{ color: track.accent, fontSize: 11, fontWeight: 800 }}>
          خريطة طريق المجال
        </div>
        <h1
          style={{
            margin: "7px 0 5px",
            fontFamily: FONT_HEAD,
            fontSize: 22,
            color: COLORS.text,
          }}
        >
          {domain.name} — الخطة
        </h1>
        <p style={{ margin: 0, color: COLORS.textDim, lineHeight: 1.8, fontSize: 12.5 }}>
          هنا نرسم خريطة شجرية توضّح كيف سنمشي في المجال، من الفكرة الرئيسية إلى المراحل والفروع التي سنعود إليها لاحقًا.
        </p>
      </div>
      <section style={{ marginTop: 14 }}>
        <div style={{ ...styles.lessonPageTitle, color: track.accent }}>
          خريطة الطريق الشجرية
        </div>
        <MindMapTab
          subtopic={subtopic}
          setTab={setTab}
          accent={track.accent}
        />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Lesson screen (page 3: دورة حياة المعرفة الـ 5 نجوم)                    */
/* ---------------------------------------------------------------------- */

function LessonScreen({ data, persist, persistLatest, domain, subtopic, goto, uploadAsset }) {
  const track = TRACKS.find(t => t.id === domain.track);
  const lessonTabDefs = domain.track === "languages" ? LANGUAGE_STAGE_DEFS : TAB_DEFS;
  const [activeTab, setActiveTab] = useState("sources");
  const [completedSteps, setCompletedSteps] = useState(
    () => lessonTabDefs.filter(tab => tabHasContent(subtopic, tab.key)).length
  );
  const stars = domain.track === "languages"
    ? LANGUAGE_STAGE_DEFS.filter(tab => tabHasContent(subtopic, tab.key)).length
    : starsFor(subtopic);
  const completionPercent = Math.round(
    (completedSteps / lessonTabDefs.length) * 100
  );
  const isScheduledTitle = Boolean(subtopic.scheduledDate);
  const completionDone = isScheduledTitle
    ? Boolean(subtopic.completed)
    : Boolean(domain.completed);
  const linkedTaskSources = (data.meta.weekTasks || []).find(
    task => task.subtopicId === subtopic.id
  )?.sources;
  const lessonSources = subtopic.sources || linkedTaskSources;

  useEffect(() => {
    setActiveTab("sources");
    setCompletedSteps(lessonTabDefs.filter(tab => tabHasContent(subtopic, tab.key)).length);
  }, [subtopic.id]);

  useEffect(() => {
    if (!lessonTabDefs.some(tab => tab.key === activeTab)) {
      setActiveTab(lessonTabDefs[0]?.key || "sources");
    }
  }, [activeTab]);

  const updateSubtopic = updater => {
    persistLatest(current => ({
      ...current,
      domains: current.domains.map(d =>
        d.id !== domain.id
          ? d
          : {
              ...d,
              subtopics: d.subtopics.map(s => {
                if (s.id !== subtopic.id) return s;
                const updated = updater(s);
                if (!s.dateStarted) updated.dateStarted = todayISO();
                return updated;
              }),
            }
      ),
    }));
  };

  const setTab = (key, value) => {
    updateSubtopic(s => ({ ...s, tabs: { ...s.tabs, [key]: value } }));
  };

  const setDetailsUnderstood = understood => {
    const next = {
      ...data,
      domains: data.domains.map(item =>
        item.id !== domain.id
          ? item
          : {
              ...item,
              subtopics: item.subtopics.map(entry =>
                entry.id === subtopic.id
                  ? { ...entry, detailsUnderstood: Boolean(understood) }
                  : entry
              ),
            }
      ),
    };
    // This confirms understanding only; it must not complete the title,
    // change lesson progress, or start the study timer.
    persist(next);
  };

  const updateLearning = patch => {
    updateSubtopic(s => ({
      ...s,
      ...patch,
      learning: {
        ...(s.learning || emptyLearning(s.title)),
        ...(patch.learning || {}),
      },
    }));
  };

  const persistSources = sources => {
    persistLatest(current => ({
      ...current,
      domains: current.domains.map(item =>
        item.id !== domain.id
          ? item
          : {
              ...item,
              subtopics: item.subtopics.map(itemSubtopic =>
                itemSubtopic.id === subtopic.id
                  ? { ...itemSubtopic, sources }
                  : itemSubtopic
              ),
            }
      ),
      meta: {
        ...current.meta,
        weekTasks: (current.meta.weekTasks || []).map(task =>
          task.subtopicId === subtopic.id ? { ...task, sources } : task
        ),
      },
    }));
  };

  const persistCompletion = completed => {
    const next = {
      ...data,
      domains: data.domains.map(item => {
        if (item.id !== domain.id) return item;
        const subtopics = item.subtopics.map(entry =>
          entry.id === subtopic.id
            ? {
                ...entry,
                ...(isScheduledTitle ? { completed } : {}),
                dateStarted: completed ? entry.dateStarted || todayISO() : entry.dateStarted,
                reviewDone: completed
                  ? Array(REVIEW_STAGES.length).fill(false)
                  : entry.reviewDone,
              }
            : entry
        );
        return isScheduledTitle
          ? { ...item, subtopics }
          : { ...item, completed, subtopics };
      }),
      meta: {
        ...data.meta,
        planItems: {
          ...data.meta.planItems,
          daily: syncDailyCompletion(
            data.meta.planItems?.daily || [],
            domain.name,
            subtopic.title,
            completed
          ),
        },
        ...(isScheduledTitle
          ? {
              weekTasks: (data.meta.weekTasks || []).map(task =>
                task.subtopicId === subtopic.id ? { ...task, completed } : task
              ),
            }
          : {}),
      },
    };
    setCompletedSteps(completed ? lessonTabDefs.length : 0);
    persist(next);
  };

  useEffect(() => {
    if (completionPercent >= 100 && !completionDone) persistCompletion(true);
  }, [completionPercent, completionDone]);

  const activeIndex = lessonTabDefs.findIndex(tab => tab.key === activeTab);
  const activeTabDef = lessonTabDefs[activeIndex];
  const isLastStep = activeIndex === lessonTabDefs.length - 1;
  const finishTitle = () => {
    persistCompletion(!completionDone);
  };
  const saveCurrentStage = () => {
    const snapshot = activeTab === "mindmap"
      ? {
          ...data,
          domains: data.domains.map(item =>
            item.id !== domain.id
              ? item
              : {
                  ...item,
                  subtopics: item.subtopics.map(entry =>
                    entry.id !== subtopic.id
                      ? entry
                      : {
                          ...entry,
                          tabs: {
                            ...entry.tabs,
                            mindmap: {
                              ...(entry.tabs?.mindmap || {}),
                              mapActionsHidden: true,
                            },
                          },
                        }
                  ),
                }
          ),
        }
      : data;
    persist(snapshot);
    notifyApp(`تم حفظ مرحلة «${activeTabDef?.label || "الدراسة"}» محليًا وسحابيًا`);
  };
  const goToStep = index => {
    if (index < 0 || index >= lessonTabDefs.length) return;
    persist(data);
    setActiveTab(lessonTabDefs[index].key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const returnFromLesson = () => {
    // Flush the latest local snapshot before changing screens. Uploads are
    // persisted as soon as they finish, and this also protects text edits.
    persist(data);
    const scheduledTask = (data.meta.weekTasks || []).find(
      task => task.subtopicId === subtopic.id
    );
    if (scheduledTask) {
      goto({
        screen: "weeklyDay",
        track: domain.track,
        quarter: scheduledTask.quarter,
        month: scheduledTask.month,
        week: scheduledTask.week,
        day: scheduledTask.day,
        year: Number(scheduledTask.year) ||
          Number(String(scheduledTask.plannedDate || "").slice(0, 4)) ||
          new Date().getFullYear(),
      });
      return;
    }
    goto({ screen: "domains", track: domain.track, domainId: domain.id });
  };

  return (
    <div style={styles.page}>
      <button
        style={styles.backRow}
        onClick={returnFromLesson}
      >
        <ChevronRight size={18} />
        {domain.name}
      </button>

      <div style={{ marginTop: 6 }}>
        <div role="heading" aria-level={1} style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 19, color: COLORS.text }}>
          {subtopic.titleHtml ? <RichTextDisplay value={subtopic.titleHtml} style={{ margin: 0, font: "inherit", color: "inherit" }} /> : subtopic.title}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 6,
          }}
        >
          <div style={{ display: "flex", gap: 2 }}>
            {[0, 1, 2, 3, 4].map(i => (
              <Star
                key={i}
                size={15}
                fill={i < stars ? track.accent : "none"}
                color={i < stars ? track.accent : COLORS.border}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>
            {subtopic.dateStarted
              ? `بدأت في ${formatArabicDate(subtopic.dateStarted)}`
              : "لم تبدأ بعد — احفظ أي تبويب لبدء العد"}
          </span>
        </div>
        <div style={styles.lessonProgress}>
          <div style={styles.lessonProgressTop}>
            <span>نسبة إتمام خطوات العنوان</span>
            <strong>{completionPercent}%</strong>
          </div>
          <div style={styles.lessonProgressTrack}>
            <div
              style={{
                ...styles.lessonProgressFill,
                width: `${completionPercent}%`,
                background: track.accent,
              }}
            />
          </div>
          {completionDone && (
            <div
              style={{
                color: COLORS.teal,
                fontSize: 11,
                fontWeight: 800,
                marginTop: 8,
              }}
            >
              ✓ تم الإنجاز — تبدأ المراجعة الأولى من الغد
            </div>
          )}
        </div>
        <button
          style={{
            ...styles.finishDomainBtn,
            ...(completionDone ? styles.finishDomainBtnDone : {}),
          }}
          onClick={finishTitle}
        >
          <CheckCircle2 size={15} />
          {completionDone ? "تم إنهاء العنوان — تراجع" : "إنهاء العنوان"}
        </button>
      </div>

      <LearningCycle
        subtopic={subtopic}
        accent={track.accent}
        onChange={updateLearning}
      />

      <div style={styles.tabStrip}>
        {lessonTabDefs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          const done = tabHasContent(subtopic, t.key);
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                ...styles.tabBtn,
                color: isActive ? track.accent : COLORS.textDim,
                borderBottomColor: isActive ? track.accent : "transparent",
              }}
            >
              <Icon size={16} />
              {t.label}
              {done && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 99,
                    background: track.accent,
                    display: "inline-block",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ paddingBottom: 100, paddingTop: 16 }}>
        <div style={{ ...styles.lessonPageTitle, color: track.accent }}>
          {activeTabDef?.label}
        </div>
        <MicroStageAction stageKey={activeTab} accent={track.accent} value={subtopic.tabs?.stageActions?.[activeTab]} onChange={value => setTab("stageActions", { ...(subtopic.tabs?.stageActions || {}), [activeTab]: value })} />
        {activeTab === "sources" && domain.track !== "languages" && (
          <StudySourcesTab
            key={subtopic.id}
            sources={lessonSources}
            accent={track.accent}
            uploadAsset={uploadAsset}
            onChange={persistSources}
          />
        )}
        {domain.track === "languages" && LANGUAGE_STAGE_DEFS.some(stage => stage.key === activeTab) && (
          <LanguageStageTab
            stage={activeTabDef}
            value={subtopic.tabs?.languageStages?.[activeTab]}
            accent={track.accent}
            uploadAsset={uploadAsset}
            onChange={value => setTab("languageStages", { ...(subtopic.tabs?.languageStages || {}), [activeTab]: value })}
          />
        )}
        {activeTab === "explanation" && (
          <ExplanationTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
            onDetailsUnderstoodChange={setDetailsUnderstood}
          />
        )}
        {activeTab === "summary" && (
          <SummaryTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
          />
        )}
        {activeTab === "mindmap" && (
          <MindMapTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
          />
        )}
        {activeTab === "attachments" && (
          <AttachmentsTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
            uploadAsset={uploadAsset}
          />
        )}
        {activeTab === "flashcards" && (
          <FlashcardsTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
            uploadAsset={uploadAsset}
          />
        )}
        {activeTab === "project" && (
          <ProjectTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
            uploadAsset={uploadAsset}
          />
        )}
        {activeTab === "fourWords" && (
          <FourWordsTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
            uploadAsset={uploadAsset}
          />
        )}
        {activeTab === "reverse" && (
          <ReverseExperienceTab
            subtopic={subtopic}
            setTab={setTab}
            accent={track.accent}
            uploadAsset={uploadAsset}
          />
        )}
        <div style={styles.lessonStepActions}>
          <button
            type="button"
            disabled={activeIndex === 0}
            style={{
              ...styles.prevStepBtn,
              ...(activeIndex === 0 ? styles.stepBtnDisabled : {}),
            }}
            onClick={() => goToStep(activeIndex - 1)}
          >
            <ChevronRight size={16} /> السابق
          </button>
          <button
            type="button"
            onClick={saveCurrentStage}
            style={{
              ...styles.saveStageBtn,
              borderColor: `${track.accent}88`,
              color: track.accent,
              margin: 0,
            }}
          >
            <Save size={15} /> حفظ المرحلة الآن
          </button>
          {isLastStep ? (
            <button
              style={{
                ...styles.finishDomainBtn,
                ...(completionDone ? styles.finishDomainBtnDone : {}),
              }}
              onClick={finishTitle}
            >
              <CheckCircle2 size={15} />
              {completionDone ? "تم إنهاء العنوان — تراجع" : "إنهاء العنوان"}
            </button>
          ) : (
            <button
              style={{ ...styles.nextStepBtn, background: track.accent }}
              onClick={() => {
                const nextSteps = Math.max(completedSteps, activeIndex + 2);
                setCompletedSteps(nextSteps);
                if (nextSteps >= lessonTabDefs.length) persistCompletion(true);
                goToStep(activeIndex + 1);
              }}
            >
              التالي <ChevronLeft size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MicroStageAction({ stageKey, accent, value, onChange }) {
  const actions = {
    listening: ["سمعت المقطع", "استمع لدقيقتين ثم سجّل حضورك."],
    reading: ["حددت أهم جملة", "اختر جملة واحدة تريد تذكرها."],
    speaking: ["مارست التحدث 30 ثانية", "قل فكرة واحدة بصوت واضح."],
    writing: ["أجبت عن سؤال اليوم", "اكتب سطرًا واحدًا عن ما تعلمته."],
    grammar: ["حللت سؤال القواعد", "اختر إجابة سريعة ثم راجع تفسيرها."],
    sources: ["راجعت المصدر", "افتح المصدر أو الملف ثم سجّل أنك راجعته."],
  };
  const [label, hint] = actions[stageKey] || ["أنجزت خطوة صغيرة", "خطوة واحدة تكفي لتحريك الرحلة."];
  return <section className="microStageAction" style={{ borderColor: `${accent}55` }}><div><strong>{label}</strong><small>{hint}</small></div><button type="button" onClick={() => onChange({ completed: !value?.completed, at: new Date().toISOString() })} style={{ color: value?.completed ? COLORS.teal : accent, borderColor: `${value?.completed ? COLORS.teal : accent}66` }}>{value?.completed ? "✓ أنجزتها" : "أنجزتها"}</button></section>;
}

function LanguageStageTab({ stage, value, accent, uploadAsset, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);
  const current = value && typeof value === "object" ? value : { text: "", files: [] };
  const files = Array.isArray(current.files) ? current.files : [];
  const update = patch => onChange({ ...current, ...patch });
  const prompts = {
    sources: "اختر مصدرًا واحدًا واضحًا لهذه الخطوة.",
    grammar: "اكتب القاعدة بطريقتك، ثم جرّب مثالًا من عندك.",
    listening: "استمع لمقطع قصير، ثم اكتب كلمة أو جملة التقطتها.",
    reading: "اقرأ فقرة قصيرة وسجّل الفكرة التي فهمتها.",
    speaking: "تحدث لدقيقة واحدة عن العنوان، ثم اكتب ما أردت تحسينه.",
    writing: "اكتب فقرة قصيرة حتى لو كانت بسيطة؛ الاستمرار أهم من الكمال.",
  };
  const markStageDone = () => update({ completed: !current.completed });
  const uploadFiles = async fileList => {
    if (!fileList?.length || !uploadAsset) return;
    setUploading(true);
    const added = [];
    try {
      for (const file of Array.from(fileList)) {
        setProgress(0);
        const stored = await uploadAsset(file, value => setProgress(Math.round(Number(value) || 0)));
        if (stored?.url || stored?.key) added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, url: stored.url, previewUrl: stored.previewUrl, storageKey: stored.key, mime: stored.mime || file.type || "application/octet-stream", size: stored.size || file.size });
      }
      if (added.length) update({ files: [...files, ...added] });
    } finally {
      setProgress(null);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <section style={{ padding: 16, border: `1px solid ${accent}55`, borderRadius: 14, background: `linear-gradient(135deg, ${accent}12, transparent)` }}>
      <div style={{ color: accent, fontWeight: 900, fontSize: 14 }}>{stage?.label}</div>
      <div style={{ marginTop: 8, padding: "9px 10px", borderRadius: 9, background: `${accent}10`, color: COLORS.textDim, fontSize: 11, lineHeight: 1.7 }}>{prompts[stage?.key] || "خذ خطوة صغيرة وسجّل ما خرجت به."}</div>
      <button type="button" onClick={markStageDone} style={{ ...styles.smallGhostBtn, marginTop: 10, color: current.completed ? COLORS.teal : accent, borderColor: `${current.completed ? COLORS.teal : accent}66` }}>
        {current.completed ? "✓ أنجزت هذه المرحلة" : `أنجزت خطوة ${stage?.label || "اليوم"}`}
      </button>
      <textarea value={current.text || ""} onChange={event => update({ text: event.target.value })} placeholder={`اكتب ملاحظاتك في مرحلة ${stage?.label || "هذه المرحلة"}…`} rows={8} style={{ width: "100%", boxSizing: "border-box", marginTop: 12, resize: "vertical", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 11, color: COLORS.text, background: COLORS.surface2, font: "inherit", lineHeight: 1.8 }} />
      <input ref={inputRef} type="file" multiple hidden disabled={uploading} onChange={event => void uploadFiles(event.target.files)} />
      <button type="button" disabled={uploading || !uploadAsset} onClick={() => inputRef.current?.click()} style={{ ...styles.smallGhostBtn, width: "100%", marginTop: 10, color: accent, borderColor: `${accent}66`, opacity: uploadAsset ? 1 : .55 }}>
        {uploading ? `جارٍ رفع الملف${progress !== null ? `… ${progress}%` : "…"}` : "رفع ملفات لهذه المرحلة"}
      </button>
      {files.length > 0 && <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        {files.map((file, index) => {
          const href = safeAssetUrl(file);
          const label = file.name || `ملف ${index + 1}`;
          return <div key={file.id || `${index}-${label}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 9, background: COLORS.surface2 }}>
            {href ? <button type="button" onClick={() => void openAssetInNewTab(file.previewUrl || href, label, file.mime)} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: accent, font: "inherit", textAlign: "start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{label}</button> : <span style={{ flex: 1, color: COLORS.textDim }}>{label}</span>}
            <button type="button" onClick={() => confirmDelete(label, () => update({ files: files.filter((_, fileIndex) => fileIndex !== index) }))} style={styles.miniIconBtn} aria-label={`حذف ${label}`}>×</button>
          </div>;
        })}
      </div>}
    </section>
  );
}

/* ---- Final tab: Four key words ---- */
function FourWordsTab({ subtopic, setTab, accent, uploadAsset }) {
  const stored = Array.isArray(subtopic.tabs?.fourWords)
    ? { words: subtopic.tabs.fourWords, image: null }
    : subtopic.tabs?.fourWords || { words: ["", "", "", ""], image: null };
  const words = [...(stored.words || []), "", "", "", ""].slice(0, 4);
  const updateWord = (index, value) => {
    const next = [...words];
    next[index] = value;
    setTab("fourWords", { ...stored, words: next });
  };
  return (
    <div>
      <div style={{ ...styles.explanationHero, borderColor: `${accent}55` }}>
        <div
          style={{
            ...styles.explanationIcon,
            color: accent,
            background: `${accent}18`,
          }}
        >
          <Hash size={22} />
        </div>
        <div>
          <div style={{ ...styles.explanationTitle, color: accent }}>
            اختصر ما تعلمته في أربع كلمات
          </div>
          <p style={styles.tabHint}>
            اكتب كلمة أو عبارة قصيرة، وستظهر الصورة المحفوظة داخل الصفحة.
          </p>
        </div>
      </div>
      <div style={styles.fourWordsGrid}>
        {words.map((word, index) => (
          <label
            key={index}
            style={{ ...styles.fourWordCard, borderColor: `${accent}55` }}
          >
            <span style={{ ...styles.fourWordNumber, color: accent }}>
              {index + 1}
            </span>
            <input
              value={word}
              onChange={e => updateWord(index, e.target.value)}
              placeholder={`الكلمة ${index + 1}`}
            />
          </label>
        ))}
      </div>
      {stored.image && safeAssetUrl(stored.image) && (
        <ProtectedAssetMedia
          kind="image"
          url={safeAssetUrl(stored.image)}
          name={stored.image.name}
          alt={stored.image.name}
          onClick={() => openAssetInNewTab(safeAssetUrl(stored.image))}
          title="فتح الصورة في تبويب جديد"
          style={{ ...styles.fourWordsImage, cursor: "pointer" }}
        />
      )}
      <div style={styles.explanationHint}>
        تُحفظ الكلمات تلقائيًا، وتظهر الملفات المحفوظة داخل الصفحة.
      </div>
    </div>
  );
}
function ReverseExperienceTab({ subtopic, setTab, accent, uploadAsset }) {
  const stored =
    typeof subtopic.tabs?.reverse === "string"
      ? { text: subtopic.tabs.reverse, audio: "", video: null, files: [] }
      : subtopic.tabs?.reverse || { text: "", audio: "", video: null, files: [] };
  const storedFiles = Array.isArray(stored.files) ? stored.files : [];
  const [value, setValue] = useState(stored.text || "");
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  useEffect(() => setValue(stored.text || ""), [subtopic.id]);
  const save = patch => setTab("reverse", { ...stored, ...patch });
  const onFiles = async fileList => {
    const added = [];
    for (const file of Array.from(fileList || [])) {
      setProgress(0);
      try {
        const storedFile = await uploadAsset(file, setProgress);
        if (!storedFile?.url && !storedFile?.key) continue;
        added.push({
          id: uid(),
          name: file.name,
          dataUrl: storedFile.url,
          storageKey: storedFile.key,
          mime: storedFile.mime || file.type || "application/octet-stream",
          size: Number(storedFile.size ?? file.size) || 0,
        });
      } catch (error) {
        notifyApp(error?.message || `تعذر رفع ${file.name}؛ حاول مرة أخرى.`);
      }
    }
    setProgress(null);
    if (added.length) {
      save({ files: [...storedFiles, ...added] });
      notifyApp(`تمت إضافة ${added.length} ملف للتجربة العكسية`);
    }
    if (inputRef.current) inputRef.current.value = "";
  };
  const removeFile = id =>
    confirmDelete("الملف المرفوع", () => save({ files: storedFiles.filter(file => file.id !== id) }));
  const renderFile = file => {
    const href = safeAssetUrl(file);
    const mime = file.mime || "application/octet-stream";
    const preview = () => void openAssetInNewTab(href, file.name, mime);
    if (/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/i.test(mime)) {
      return <div><ProtectedAssetMedia kind="image" url={href} name={file.name} alt={file.name} onClick={preview} title="فتح المعاينة في تبويب جديد" style={{ ...styles.reverseFileImage, cursor: "pointer" }} /><button type="button" onClick={preview} style={styles.reverseFileLink}><Eye size={16} /> معاينة في تبويب جديد</button></div>;
    }
    if (mime.startsWith("video/")) {
      return <div><ProtectedAssetMedia kind="video" url={href} name={file.name} style={styles.reverseFileVideo} /><button type="button" onClick={preview} style={styles.reverseFileLink}><Eye size={16} /> معاينة الفيديو في تبويب جديد</button></div>;
    }
    if (mime.startsWith("audio/")) {
      return <div><ProtectedAssetMedia kind="audio" url={href} name={file.name} style={{ width: "100%" }} /><button type="button" onClick={preview} style={styles.reverseFileLink}><Eye size={16} /> معاينة الصوت في تبويب جديد</button></div>;
    }
    return <button type="button" onClick={preview} style={styles.reverseFileLink}><Eye size={16} /> معاينة الملف في تبويب جديد</button>;
  };
  return (
    <div>
      <div style={{ ...styles.explanationHero, borderColor: `${accent}55` }}>
        <div style={{ ...styles.explanationIcon, color: accent, background: `${accent}18` }}><Route size={22} /></div>
        <div>
          <div style={{ ...styles.explanationTitle, color: accent }}>التجربة العكسية</div>
          <p style={styles.tabHint}>اختبر نفسك من ذاكرتك واكتب إجابتك، وأرفق أي نوع من الملفات لمراجعته.</p>
        </div>
      </div>
      <RichTextEditor
        style={{ ...styles.input, minHeight: 210, resize: "vertical", lineHeight: 1.9 }}
        value={value}
        onChange={setValue}
        onBlur={() => save({ text: value })}
        placeholder="اكتب ما تتذكره عن العنوان، أو اشرح الحل والخطوات بأسلوبك…"
        ariaLabel="إجابتك في التجربة العكسية"
        minHeight={210}
      />
      {stored.audio && <div style={{ marginTop: 10 }}><ProtectedAssetMedia kind="audio" url={safeAssetUrl(stored.audio)} style={{ width: "100%" }} /><button type="button" onClick={() => void openAssetInNewTab(safeAssetUrl(stored.audio))} style={styles.reverseFileLink}><Eye size={16} /> معاينة الصوت في تبويب جديد</button></div>}
      {stored.video && safeAssetUrl(stored.video) && <div style={{ marginTop: 10 }}><ProtectedAssetMedia kind="video" url={safeAssetUrl(stored.video)} name={stored.video.name} style={{ width: "100%", maxHeight: 220, borderRadius: 12 }} /><button type="button" onClick={() => void openAssetInNewTab(safeAssetUrl(stored.video), stored.video.name, stored.video.mime)} style={styles.reverseFileLink}><Eye size={16} /> معاينة الفيديو في تبويب جديد</button></div>}
      <input ref={inputRef} type="file" multiple hidden disabled={progress !== null} onChange={event => { void onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <button type="button" disabled={progress !== null} onClick={() => inputRef.current?.click()} style={{ ...styles.smallGhostBtn, display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, padding: "10px 14px", color: accent, borderColor: `${accent}88`, opacity: progress !== null ? 0.65 : 1 }}>
        <FileUp size={15} /> {progress !== null ? `جارٍ الرفع… ${Math.round(progress)}%` : "إرفاق ملفات — كل الأنواع"}
      </button>
      <div style={styles.reverseFilesList}>
        {storedFiles.map(file => (
          <div key={file.id} style={styles.reverseFileCard}>
            <div style={styles.reverseFileName}>{file.name}</div>
            <div style={{ color: COLORS.textDim, fontSize: 10, marginBottom: 6 }}>{file.mime || "نوع الملف غير معروف"} · {formatAssetSize(file.size)}</div>
            {renderFile(file)}
            <button type="button" style={styles.smallGhostBtn} onClick={() => removeFile(file.id)} aria-label={`حذف ${file.name}`}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div style={styles.explanationHint}>يُحفظ النص والملفات تلقائيًا، ثم اضغط التالي لإكمال مراحل العنوان.</div>
    </div>
  );
}

/* ---- Tab 1: Explanation & web research ---- */
function ExplanationTab({ subtopic, setTab, accent, onDetailsUnderstoodChange }) {
  const explanation = subtopic.tabs?.explanation || { url: "", notes: "" };
  const detailsUnderstood = Boolean(subtopic.detailsUnderstood);
  const [url, setUrl] = useState(explanation.url || "");
  const [notes, setNotes] = useState(explanation.notes || "");
  useEffect(() => {
    setUrl(explanation.url || "");
    setNotes(explanation.notes || "");
  }, [subtopic.id]);
  const query = encodeURIComponent(`${subtopic.title} شرح`);
  const save = next => setTab("explanation", { ...explanation, ...next });
  return (
    <div>
      <div style={{ ...styles.explanationHero, borderColor: `${accent}55` }}>
        <div
          style={{
            ...styles.explanationIcon,
            color: accent,
            background: `${accent}18`,
          }}
        >
          <Search size={22} />
        </div>
        <div>
          <div style={{ ...styles.explanationTitle, color: accent }}>
            ابدأ من تبويب الشرح
          </div>
          <p style={styles.tabHint}>
            ابحث عن شرح واضح للعنوان على الإنترنت، ثم احفظ الرابط وملاحظاتك هنا
            للرجوع إليها أثناء المذاكرة.
          </p>
        </div>
      </div>
      <div
        role="group"
        aria-label="تأكيد فهم تفاصيل الموضوع"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          margin: "14px 0",
          padding: "14px 16px",
          border: `1px solid ${accent}55`,
          borderRadius: 14,
          background: `linear-gradient(135deg, ${accent}12, ${COLORS.surface2})`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 800 }}>
            فهمت تفاصيل الموضوع
          </div>
          <div style={{ marginTop: 4, color: COLORS.textDim, fontSize: 11.5, lineHeight: 1.7 }}>
            اختر «تم» بعد فهم الشرح. هذا التأكيد منفصل عن إتمام العنوان ونسبة الإنجاز.
          </div>
        </div>
        <label
          style={{
            display: "inline-flex",
            flexShrink: 0,
            alignItems: "center",
            gap: 7,
            padding: "8px 11px",
            border: `1px solid ${detailsUnderstood ? `${accent}aa` : COLORS.border}`,
            borderRadius: 10,
            background: detailsUnderstood ? `${accent}18` : COLORS.surface,
            color: detailsUnderstood ? accent : COLORS.textDim,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={detailsUnderstood}
            onChange={event => onDetailsUnderstoodChange(event.target.checked)}
            aria-label="تم — فهمت تفاصيل الموضوع"
            style={{ width: 18, height: 18, margin: 0, accentColor: accent, cursor: "pointer" }}
          />
          تم
        </label>
      </div>
      <div style={styles.webSearchGrid}>
        <a
          href={`https://www.google.com/search?q=${query}`}
          rel="noreferrer"
          style={{ ...styles.webSearchBtn, borderColor: `${accent}55` }}
        >
          <Search size={17} /> البحث في Google
          <ExternalLink size={13} />
        </a>
        <a
          href={`https://www.youtube.com/results?search_query=${query}`}
          rel="noreferrer"
          style={{
            ...styles.webSearchBtn,
            borderColor: "#E05252aa",
            color: "#F08080",
          }}
        >
          <Film size={17} /> البحث في YouTube
          <ExternalLink size={13} />
        </a>
      </div>
      <label style={styles.fieldLabel}>رابط الشرح الذي اخترته</label>
      <input
        style={styles.input}
        value={url}
        onChange={e => {
          const value = e.target.value;
          setUrl(value);
          save({ url: value });
        }}
        onBlur={() => save({ url })}
        placeholder="الصق رابط المقال أو الفيديو هنا…"
      />
      {url.trim() && (
        <a href={url} style={styles.savedLink}>
          <ExternalLink size={14} /> فتح رابط الشرح المحفوظ
        </a>
      )}
      <label style={styles.fieldLabel}>ملاحظات أثناء الاستماع أو القراءة</label>
      <RichTextEditor
        style={{
          ...styles.input,
          minHeight: 150,
          resize: "vertical",
          lineHeight: 1.8,
        }}
        value={notes}
        onChange={value => {
          setNotes(value);
          save({ notes: value });
        }}
        onBlur={() => save({ notes })}
        placeholder="اكتب أهم النقاط أو الأسئلة التي تريد مراجعتها…"
        ariaLabel="ملاحظات أثناء الاستماع أو القراءة"
        minHeight={150}
      />
      <div style={styles.explanationHint}>
        يُحفظ الرابط والملاحظات تلقائيًا أثناء الكتابة، ويمكنك الضغط على «حفظ المرحلة الآن» قبل المغادرة.
      </div>
    </div>
  );
}

/* ---- Tab 1: Summary ---- */
function SummaryTab({ subtopic, setTab, accent }) {
  const [val, setVal] = useState(subtopic.tabs?.summary || "");
  const defaultStyle = {
    fontFamily: FONT_BODY,
    fontSize: 14.5,
    fontWeight: 500,
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "start",
    color: COLORS.text,
  };
  const summaryStyle = { ...defaultStyle, ...(subtopic.tabs?.summaryStyle || {}) };
  useEffect(() => setVal(subtopic.tabs?.summary || ""), [subtopic.id, subtopic.tabs?.summary]);
  const updateStyle = patch => setTab("summaryStyle", { ...summaryStyle, ...patch });
  const toggleStyle = (key, activeValue, inactiveValue) =>
    updateStyle({ [key]: summaryStyle[key] === activeValue ? inactiveValue : activeValue });
  return (
    <div>
      <p style={styles.tabHint}>
        اكتب تلخيصك الشخصي لهذا الموضوع بأسلوبك الخاص — الكتابة اليدوية بكلماتك
        تثبّت الفهم.
      </p>
      <div
        className="summaryToolbar"
        role="toolbar"
        aria-label="أدوات تنسيق الملخص"
        aria-hidden="true"
        style={{
          display: "none",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          padding: 8,
          marginBottom: 8,
          border: `1px solid ${accent}38`,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${accent}12, ${COLORS.surface2})`,
        }}
      >
        <select
          aria-label="نوع الخط"
          value={summaryStyle.fontFamily}
          onChange={event => updateStyle({ fontFamily: event.target.value })}
          style={{ ...styles.select, minWidth: 132, height: 34, fontFamily: summaryStyle.fontFamily }}
        >
          <option value={FONT_BODY}>Tajawal — مريح</option>
          <option value={FONT_HEAD}>Cairo — عناوين</option>
          <option value="Georgia, serif">Georgia — كلاسيكي</option>
          <option value="Arial, sans-serif">Arial — واضح</option>
        </select>
        <select
          aria-label="حجم الخط"
          value={String(summaryStyle.fontSize)}
          onChange={event => updateStyle({ fontSize: Number(event.target.value) })}
          style={{ ...styles.select, width: 82, height: 34 }}
        >
          {[13, 14.5, 16, 18, 20, 24].map(size => (
            <option key={size} value={size}>{size}px</option>
          ))}
        </select>
        <button
          type="button"
          aria-label="عريض"
          aria-pressed={summaryStyle.fontWeight >= 700}
          onClick={() => toggleStyle("fontWeight", 700, 500)}
          style={{ ...styles.miniIconBtn, width: 34, height: 34, color: summaryStyle.fontWeight >= 700 ? accent : COLORS.textDim, borderColor: summaryStyle.fontWeight >= 700 ? accent : COLORS.border }}
        ><Bold size={16} /></button>
        <button
          type="button"
          aria-label="مائل"
          aria-pressed={summaryStyle.fontStyle === "italic"}
          onClick={() => toggleStyle("fontStyle", "italic", "normal")}
          style={{ ...styles.miniIconBtn, width: 34, height: 34, color: summaryStyle.fontStyle === "italic" ? accent : COLORS.textDim, borderColor: summaryStyle.fontStyle === "italic" ? accent : COLORS.border }}
        ><Italic size={16} /></button>
        <button
          type="button"
          aria-label="تحته خط"
          aria-pressed={summaryStyle.textDecoration === "underline"}
          onClick={() => toggleStyle("textDecoration", "underline", "none")}
          style={{ ...styles.miniIconBtn, width: 34, height: 34, color: summaryStyle.textDecoration === "underline" ? accent : COLORS.textDim, borderColor: summaryStyle.textDecoration === "underline" ? accent : COLORS.border }}
        ><Underline size={16} /></button>
        {[{ value: "start", icon: AlignRight, label: "محاذاة لليمين" }, { value: "center", icon: AlignCenter, label: "توسيط" }, { value: "end", icon: AlignLeft, label: "محاذاة لليسار" }].map(item => {
          const AlignIcon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              aria-label={item.label}
              aria-pressed={summaryStyle.textAlign === item.value}
              onClick={() => updateStyle({ textAlign: item.value })}
              style={{ ...styles.miniIconBtn, width: 34, height: 34, color: summaryStyle.textAlign === item.value ? accent : COLORS.textDim, borderColor: summaryStyle.textAlign === item.value ? accent : COLORS.border }}
            ><AlignIcon size={16} /></button>
          );
        })}
        <label title="لون النص" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: `1px solid ${COLORS.border}`, borderRadius: 7, cursor: "pointer", background: COLORS.surface2 }}>
          <input
            aria-label="لون النص"
            type="color"
            value={summaryStyle.color}
            onChange={event => updateStyle({ color: event.target.value })}
            style={{ width: 22, height: 22, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
          />
        </label>
        <button
          type="button"
          aria-label="إعادة التنسيق الافتراضي"
          title="إعادة التنسيق الافتراضي"
          onClick={() => setTab("summaryStyle", defaultStyle)}
          style={{ ...styles.miniIconBtn, width: 34, height: 34, marginInlineStart: "auto" }}
        ><RotateCcw size={15} /></button>
      </div>
      <RichTextEditor
        style={{
          ...styles.input,
          minHeight: 260,
          resize: "vertical",
          lineHeight: 1.8,
          ...summaryStyle,
          borderColor: `${accent}55`,
        }}
        value={val}
        onChange={value => {
          setVal(value);
          setTab("summary", value);
        }}
        onBlur={() => setTab("summary", val)}
        placeholder="ابدأ الكتابة هنا…"
        ariaLabel="الملخص الشخصي"
        accent={accent}
        minHeight={260}
      />
      <div style={{ fontSize: 11.5, color: COLORS.textDim, marginTop: 6 }}>
        {richTextToPlainText(val).split(/\s+/).filter(Boolean).length} كلمة · يُحفظ تلقائيًا أثناء الكتابة
      </div>
    </div>
  );
}

/* ---- Tab 2: Mind map ---- */
function MindMapTab({ subtopic, setTab, accent }) {
  const mindmapTab = subtopic.tabs?.mindmap || {};
  const storedNodes = mindmapTab.nodes;
  const actionsHidden = Boolean(mindmapTab.mapActionsHidden);
  const nodes = Array.isArray(storedNodes) && storedNodes.length
    ? storedNodes
    : [{ id: "root", parentId: null, text: "" }];
  const setNodes = next => setTab("mindmap", { nodes: next, mapActionsHidden: false });
  const revealActions = () => {
    if (actionsHidden) setTab("mindmap", { ...mindmapTab, mapActionsHidden: false });
  };

  const addChild = parentId => {
    setNodes([...nodes, { id: uid(), parentId, text: "" }]);
    notifyApp("تمت إضافة الفرع بنجاح");
  };
  const editNode = (id, text) =>
    setNodes(nodes.map(n => (n.id === id ? { ...n, text } : n)));
  const removeNode = id => {
    if (!confirmDelete("الفرع المحدد", () => removeNodeNow(id))) return;
  };
  const removeNodeNow = id => {
    const toRemove = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(n => {
        if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          changed = true;
        }
      });
    }
    setNodes(nodes.filter(n => !toRemove.has(n.id)));
  };

  const root = nodes.find(n => n.parentId === null);
  const childrenOf = id => nodes.filter(n => n.parentId === id);

  return (
    <div>
      <p style={styles.tabHint}>
        حوّل ملخصك إلى خريطة شجرية: ابدأ من الفكرة الرئيسية وأضف الفروع المتفرعة منها.
      </p>
      {actionsHidden && (
        <button type="button" onClick={revealActions} style={{ ...styles.smallGhostBtn, color: accent, borderColor: `${accent}66`, marginBottom: 10 }}>
          <Pencil size={14} /> تعديل الخريطة
        </button>
      )}
      <div style={styles.mindmapBox}>
        <div className="mindmapInner">
          {actionsHidden ? (
            <SavedMindMap
              root={root}
              nodes={nodes}
              rootLabel={subtopic.title}
              accent={accent}
            />
          ) : (
            <TreeNode
              node={root}
              nodes={nodes}
              accent={accent}
              onAdd={addChild}
              onEdit={editNode}
              onRemove={removeNode}
              isRoot
              rootLabel={subtopic.title}
              childrenOf={childrenOf}
              depth={0}
              actionsHidden={false}
              onRevealActions={revealActions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const SAVED_MAP_NODE_WIDTH = 220;
const SAVED_MAP_LEVEL_GAP = 82;
const SAVED_MAP_SIDE_PADDING = 28;

function buildSavedMindMapLayout(root, nodes, rootLabel) {
  const childrenByParent = new Map();
  nodes.forEach(node => {
    if (!node.parentId) return;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  });
  const positioned = [];
  let leafIndex = 0;
  let maxDepth = 0;
  const place = (node, depth, isRoot = false) => {
    const label = String(isRoot ? rootLabel : node?.text || "فرع جديد").trim() || "فرع جديد";
    const plainLabel = richTextToPlainText(label);
    const lines = Math.max(1, Math.min(4, Math.ceil(plainLabel.length / 28)));
    const height = 54 + lines * 19;
    const children = childrenByParent.get(node.id) || [];
    maxDepth = Math.max(maxDepth, depth);
    const childPositions = children.map(child => place(child, depth + 1));
    const x = childPositions.length
      ? (childPositions[0].x + childPositions[childPositions.length - 1].x) / 2
      : SAVED_MAP_SIDE_PADDING + leafIndex++ * (SAVED_MAP_NODE_WIDTH + SAVED_MAP_LEVEL_GAP);
    const item = { id: node.id, parentId: node.parentId, label, x, y: SAVED_MAP_SIDE_PADDING + depth * 154, width: SAVED_MAP_NODE_WIDTH, height, depth, isRoot };
    positioned.push(item);
    return item;
  };
  if (root) place(root, 0, true);
  const width = Math.max(
    520,
    Math.max(...positioned.map(item => item.x + item.width), 0) + SAVED_MAP_SIDE_PADDING,
  );
  const height = Math.max(
    300,
    Math.max(...positioned.map(item => item.y + item.height), 0) + SAVED_MAP_SIDE_PADDING,
  );
  const byId = new Map(positioned.map(item => [item.id, item]));
  const links = positioned
    .filter(item => item.parentId && byId.has(item.parentId))
    .map(item => ({ from: byId.get(item.parentId), to: item }));
  return { positioned, links, width, height };
}

function SavedMindMap({ root, nodes, rootLabel, accent }) {
  const layout = buildSavedMindMapLayout(root, nodes, rootLabel);
  const [zoom, setZoom] = useState(0.82);
  const scaledWidth = layout.width * zoom;
  const scaledHeight = layout.height * zoom;
  return (
    <div className="savedMindMapWrap">
      <div className="savedMindMapToolbar" role="toolbar" aria-label="التحكم في حجم الخريطة">
        <span>حجم الخريطة</span>
        <button type="button" onClick={() => setZoom(value => Math.max(.55, Number((value - .1).toFixed(2))))} aria-label="تصغير الخريطة">−</button>
        <strong>{Math.round(zoom * 100)}%</strong>
        <button type="button" onClick={() => setZoom(value => Math.min(1.25, Number((value + .1).toFixed(2))))} aria-label="تكبير الخريطة">+</button>
        <button type="button" onClick={() => setZoom(.82)} aria-label="إعادة حجم الخريطة" title="إعادة الحجم">↺</button>
      </div>
      <div className="savedMindMapStage" style={{ width: scaledWidth, height: scaledHeight }}>
        <div
          className="savedMindMapCanvas"
          style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
          aria-label="الخريطة الذهنية المحفوظة"
        >
          <svg
            className="savedMindMapLinks"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            <defs>
              <marker id="saved-map-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4.5 L0,9" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {layout.links.map(({ from, to }) => {
              const startX = from.x + from.width / 2;
              const startY = from.y + from.height;
              const endX = to.x + to.width / 2;
              const endY = to.y;
              const midY = startY + (endY - startY) * 0.5;
              const path = `M ${startX} ${startY} C ${startX - 14} ${startY + 18}, ${endX + 14} ${midY - 12}, ${endX} ${endY - 6}`;
              return (
                <g key={`${from.id}-${to.id}`}>
                  <path d={path} fill="none" stroke={accent} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" opacity=".82" markerEnd="url(#saved-map-arrow)" />
                  <path d={path} fill="none" stroke={accent} strokeWidth="1" strokeLinecap="round" opacity=".42" transform="translate(2 1)" />
                </g>
              );
            })}
          </svg>
          {layout.positioned.map(item => (
            <div
              key={item.id}
              className="savedMindMapNode"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                minHeight: item.height,
                borderColor: item.isRoot ? accent : "#A9977A",
                background: item.isRoot ? "#DDF4EC" : "#FFF8D9",
                color: item.isRoot ? "#244D43" : "#3F392F",
              }}
            >
              <RichTextDisplay
                value={item.label}
                style={{ margin: 0, fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit", textAlign: "center" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  accent,
  onAdd,
  onEdit,
  onRemove,
  isRoot,
  rootLabel,
  childrenOf,
  depth = 0,
  actionsHidden = false,
  onRevealActions,
}) {
  const kids = childrenOf(node.id);
  const textValue = isRoot ? rootLabel : node.text;
  const textLength = richTextToPlainText(textValue).length;
  const nodeWidth = Math.min(430, Math.max(120, textLength * 7.2 + 28));
  const nodeRows = Math.max(1, Math.ceil(textLength / 42));
  const tilt = isRoot ? 0 : ((String(node.id).charCodeAt(0) % 5) - 2) * 0.7;
  const showActions = !actionsHidden;
  return (
    <div style={styles.treeNodeWrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            ...styles.mindNodeBubble,
            borderColor: isRoot ? accent : COLORS.border,
            background: isRoot ? "#DDF4EC" : "#FFF8D9",
            fontWeight: isRoot ? 700 : 500,
            width: `${nodeWidth}px`,
            maxWidth: "min(100%, 430px)",
            transform: `rotate(${tilt}deg)`,
            fontFamily: '"Kalam", "Patrick Hand", "Comic Sans MS", cursive',
          }}
        >
          <RichTextEditor
            style={{ ...styles.mindNodeInput, minHeight: Math.max(28, nodeRows * 27) }}
            value={textValue}
            disabled={isRoot}
            readOnly={!isRoot && actionsHidden}
            placeholder={isRoot ? "" : "فرع جديد…"}
            ariaLabel={isRoot ? "عنوان الخريطة الذهنية" : "نص فرع الخريطة الذهنية"}
            onFocus={onRevealActions}
            onChange={value => onEdit(node.id, value)}
            accent={accent}
            minHeight={Math.max(28, nodeRows * 27)}
            compact
          />
        </div>
        {showActions && <button
          style={{ ...styles.treeActionBtn, background: "#E6F3EC", borderColor: accent, color: accent }}
          onClick={() => onAdd(node.id)}
          title="إضافة فرع"
        >
          <Plus size={13} />
        </button>}
        {!isRoot && showActions && (
          <button
            style={styles.treeActionBtn}
            onClick={() => onRemove(node.id)}
            title="حذف"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {kids.length > 0 && (
        <div
          className={actionsHidden ? "treeChildrenSaved" : ""}
          style={{ ...styles.treeChildren, marginTop: actionsHidden ? 0 : 34, borderTopColor: `${accent}66`, color: accent }}
        >
          {actionsHidden && <div className="treeParentStem" style={{ color: accent }} aria-hidden="true">
            <svg viewBox="0 0 44 26" role="presentation">
              <path d="M22 0 C 14 6, 31 12, 22 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
              <path d="M18 20 C 20 23, 21 24, 22 25" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".42" />
            </svg>
          </div>}
          {kids.map(k => (
            <div key={k.id} style={{ ...styles.treeChild, position: "relative", paddingTop: actionsHidden ? 58 : 5 }}>
              {actionsHidden && <div className="treeHandArrow" style={{ color: accent }} aria-hidden="true">
                  <svg viewBox="0 0 82 58" role="presentation">
                    <path d="M41 0 C 28 9, 54 14, 42 26 S 27 43, 41 54" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M39 2 C 28 10, 51 14, 40 25" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".42" />
                    <path d="M33 49 L41 57 L49 49" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>}
              <TreeNode
              node={k}
              accent={accent}
              onAdd={onAdd}
              onEdit={onEdit}
              onRemove={onRemove}
              childrenOf={childrenOf}
              depth={depth + 1}
              actionsHidden={actionsHidden}
              onRevealActions={onRevealActions}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Tab 3: Attachments and media ---- */
function formatAssetSize(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function AttachmentsTab({ subtopic, setTab, accent, uploadAsset }) {
  const items = Array.isArray(subtopic.tabs?.attachments) ? subtopic.tabs.attachments : [];
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const onFiles = async fileList => {
    const added = [];
    for (const file of Array.from(fileList || [])) {
      setProgress(0);
      try {
        const storedFile = await uploadAsset(file, setProgress);
        if (!storedFile?.url && !storedFile?.key) continue;
        added.push({
          id: uid(),
          name: file.name,
          dataUrl: storedFile.url,
          storageKey: storedFile.key,
          mime: storedFile.mime || file.type || "application/octet-stream",
          size: Number(storedFile.size ?? file.size) || 0,
          caption: "",
        });
      } catch (error) {
        notifyApp(error?.message || `تعذر رفع ${file.name}؛ حاول مرة أخرى.`);
      }
    }
    setProgress(null);
    if (added.length) {
      setTab("attachments", [...items, ...added]);
      notifyApp(`تمت إضافة ${added.length} ملف/مرئية`);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const setCaption = (id, caption) =>
    setTab("attachments", items.map(item => item.id === id ? { ...item, caption } : item));
  const remove = id =>
    confirmDelete("المرفق", () => setTab("attachments", items.filter(item => item.id !== id)));

  return (
    <div>
      <p style={styles.tabHint}>
        ارفع أي نوع من الملفات أو المرئيات؛ افتح اسم الملف لمعاينة المحتوى أو تفاصيله في تبويب جديد.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={progress !== null}
        onChange={event => { void onFiles(event.currentTarget.files); event.currentTarget.value = ""; }}
      />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => inputRef.current?.click()}
        style={{ ...styles.smallGhostBtn, display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", color: accent, borderColor: `${accent}88`, opacity: progress !== null ? 0.65 : 1 }}
      >
        <FileUp size={15} /> {progress !== null ? `جارٍ رفع الملف… ${Math.round(progress)}%` : "رفع ملف أو مرئية — كل الأنواع"}
      </button>
      {items.length > 0 ? (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {items.map(item => {
            const href = safeAssetUrl(item);
            const mime = item.mime || "application/octet-stream";
            const isInlineImage = /^image\/(?:png|jpeg|gif|webp|avif|bmp)$/i.test(mime);
            return (
              <div key={item.id} style={{ ...styles.fileRow, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {isInlineImage && href ? (
                  <ProtectedAssetMedia kind="image" url={href} name={item.name} alt={item.name} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />
                ) : <FileText size={18} color={accent} />}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <button type="button" disabled={!href} onClick={() => void openAssetInNewTab(href, item.name, mime)} style={{ display: "block", border: 0, padding: 0, background: "transparent", color: accent, font: "inherit", fontWeight: 800, textAlign: "start", cursor: href ? "pointer" : "not-allowed", overflowWrap: "anywhere" }}>
                    {item.name || "ملف مرفق"}
                  </button>
                  <small style={{ color: COLORS.textDim, fontSize: 10 }}>{mime} · {formatAssetSize(item.size)}</small>
                </div>
                {href && <button type="button" onClick={() => void openAssetInNewTab(href, item.name, mime)} style={styles.smallGhostBtn} aria-label={`معاينة ${item.name}`} title="فتح المعاينة في تبويب جديد"><Eye size={14} /></button>}
                <button type="button" style={styles.smallGhostBtn} onClick={() => remove(item.id)} aria-label={`حذف ${item.name}`}><Trash2 size={14} /></button>
                <input style={{ ...styles.captionInput, flex: "1 1 100%" }} value={item.caption || ""} onChange={event => setCaption(item.id, event.target.value)} placeholder="وصف مختصر…" />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...styles.emptyCard, marginTop: 12 }}>لا توجد مرفقات أو مرئيات بعد.</div>
      )}
    </div>
  );
}

function FlashcardsTab({ subtopic, setTab, accent, uploadAsset }) {
  const items = Array.isArray(subtopic.tabs?.flashcards) ? subtopic.tabs.flashcards : [];
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const onFiles = async fileList => {
    const added = [];
    for (const file of Array.from(fileList || [])) {
      setProgress(0);
      try {
        const storedFile = await uploadAsset(file, setProgress);
        if (!storedFile?.url && !storedFile?.key) continue;
        added.push({
          id: uid(),
          name: file.name,
          dataUrl: storedFile.url,
          storageKey: storedFile.key,
          mime: storedFile.mime || file.type || "application/octet-stream",
          size: Number(storedFile.size ?? file.size) || 0,
        });
      } catch (error) {
        notifyApp(error?.message || `تعذر رفع ${file.name}؛ حاول مرة أخرى.`);
      }
    }
    setProgress(null);
    if (added.length) {
      setTab("flashcards", [...items, ...added]);
      notifyApp(`تمت إضافة ${added.length} ملف للبطاقات التعليمية`);
    }
    if (inputRef.current) inputRef.current.value = "";
  };
  const removeFile = id =>
    confirmDelete("ملف البطاقة التعليمية", () => setTab("flashcards", items.filter(item => item.id !== id)));

  return (
    <div>
      <p style={styles.tabHint}>ارفع أي ملف مرتبط بالبطاقات التعليمية؛ افتح اسمه لمعاينته في تبويب جديد.</p>
      <input ref={inputRef} type="file" multiple hidden disabled={progress !== null} onChange={event => { void onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <button type="button" disabled={progress !== null} onClick={() => inputRef.current?.click()} style={{ ...styles.smallGhostBtn, display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", color: accent, borderColor: `${accent}88`, opacity: progress !== null ? 0.65 : 1 }}>
        <FileUp size={15} /> {progress !== null ? `جارٍ الرفع… ${Math.round(progress)}%` : "رفع ملف أو أكثر — كل الأنواع"}
      </button>
      <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", border: `1px solid ${accent}44`, borderRadius: 12, background: COLORS.surface }}>
            <BookOpen size={20} color={accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <button type="button" onClick={() => void openAssetInNewTab(safeAssetUrl(item), item.name, item.mime)} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "transparent", color: accent, font: "inherit", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start", cursor: "pointer" }}>
                {item.name}
              </button>
              <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 4 }}>
                {formatAssetSize(item.size)} · {item.mime || "نوع الملف غير معروف"}
              </div>
            </div>
            <button type="button" onClick={() => void openAssetInNewTab(safeAssetUrl(item), item.name, item.mime)} style={{ ...styles.miniIconBtn, color: accent }} aria-label={`معاينة ${item.name}`} title="معاينة في تبويب جديد"><Eye size={14} /></button>
            <button type="button" onClick={() => removeFile(item.id)} style={{ ...styles.miniIconBtn, color: COLORS.danger, borderColor: `${COLORS.danger}44` }} aria-label="حذف الملف"><X size={14} /></button>
          </div>
        ))}
      </div>
      {items.length === 0 && <div style={{ ...styles.emptyCard, marginTop: 12 }}>لا توجد ملفات بطاقات تعليمية بعد.</div>}
    </div>
  );
}

/* ---- Tab 5: Video ---- */
function youTubeEmbed(url) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function VideoTab({ subtopic, setTab, accent, uploadAsset }) {
  const v = subtopic.tabs?.video || { url: "", notes: "", files: [] };
  const [url, setUrl] = useState(v.url);
  const [notes, setNotes] = useState(v.notes);
  useEffect(() => {
    setUrl(v.url);
    setNotes(v.notes);
  }, [subtopic.id]);
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const embed = youTubeEmbed(url);

  const onFiles = async fileList => {
    const files = Array.from(fileList);
    const added = [];
    for (const f of files) {
      setProgress(0);
      const storedFile = await uploadAsset(f, setProgress);
      if (!storedFile) continue;
      added.push({ id: uid(), name: f.name, dataUrl: storedFile.url, storageKey: storedFile.key, mime: f.type });
      setProgress(null);
    }
    if (added.length) {
      setTab("video", { ...v, files: [...v.files, ...added] });
      notifyApp("تمت إضافة الملفات بنجاح");
    }
  };
  const removeFile = id =>
    confirmDelete("ملف الفيديو أو الصوت", () =>
      setTab("video", { ...v, files: v.files.filter(f => f.id !== id) })
    );

  return (
    <div>
      <p style={styles.tabHint}>
        ادمج الصوت والصورة في شرح مبسّط بإضافة رابط. الوسائط المحفوظة تظهر داخل الصفحة.
      </p>
      <label style={styles.fieldLabel}>رابط فيديو (يوتيوب أو أي رابط)</label>
      <input
        style={styles.input}
        value={url}
        onChange={e => {
          const value = e.target.value;
          setUrl(value);
          setTab("video", { ...v, url: value });
        }}
        onBlur={() => setTab("video", { ...v, url })}
        placeholder="https://youtube.com/watch?v=..."
      />
      {embed && (
        <div style={styles.videoEmbedWrap}>
          <iframe
            src={embed}
            style={styles.videoEmbed}
            allowFullScreen
            title="فيديو"
          />
        </div>
      )}

      <label style={styles.fieldLabel}>ملاحظات لتبسيط المفهوم</label>
      <RichTextEditor
        style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
        value={notes}
        onChange={value => {
          setNotes(value);
          setTab("video", { ...v, notes: value });
        }}
        onBlur={() => setTab("video", { ...v, notes })}
        placeholder="اشرح الفكرة بجملة أو جملتين بسيطتين"
        ariaLabel="ملاحظات لتبسيط المفهوم"
        minHeight={90}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 10,
        }}
      >
        {v.files.map(f => (
          <div key={f.id} style={styles.fileRow}>
            {f.mime?.startsWith("video/") ? (
              <div>
                <ProtectedAssetMedia kind="video" url={safeAssetUrl(f)} name={f.name} style={{ width: "100%", borderRadius: 10 }} />
                <button type="button" onClick={() => openAssetInNewTab(safeAssetUrl(f))} style={styles.reverseFileLink}>
                  <Film size={16} /> فتح الفيديو في تبويب جديد
                </button>
              </div>
            ) : (
              <div>
                <ProtectedAssetMedia kind="audio" url={safeAssetUrl(f)} name={f.name} style={{ width: "100%" }} />
                <button type="button" onClick={() => openAssetInNewTab(safeAssetUrl(f))} style={styles.reverseFileLink}>
                  <FileText size={16} /> فتح الصوت في تبويب جديد
                </button>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 12, color: COLORS.textDim }}>
                {f.name}
              </span>
              <button
                style={styles.smallGhostBtn}
                onClick={() => removeFile(f.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Tab 5: Project ---- */
function ProjectTab({ subtopic, setTab, accent, uploadAsset }) {
  const p = subtopic.tabs?.project || { description: "", links: [], files: [] };
  const [desc, setDesc] = useState(p.description);
  useEffect(() => setDesc(p.description), [subtopic.id]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const addLink = () => {
    if (!linkUrl.trim()) return;
    setTab("project", {
      ...p,
      links: [
        ...p.links,
        {
          id: uid(),
          label: linkLabel.trim() || linkUrl.trim(),
          url: linkUrl.trim(),
        },
      ],
    });
    setLinkLabel("");
    setLinkUrl("");
    notifyApp("تمت إضافة الرابط بنجاح");
  };
  const removeLink = id =>
    confirmDelete("الرابط", () =>
      setTab("project", { ...p, links: p.links.filter(l => l.id !== id) })
    );

  const onFiles = async fileList => {
    const files = Array.from(fileList || []);
    const added = [];
    for (const f of files) {
      setProgress(0);
      try {
        const storedFile = await uploadAsset(f, setProgress);
        if (!storedFile?.url && !storedFile?.key) continue;
        added.push({ id: uid(), name: f.name, dataUrl: storedFile.url, storageKey: storedFile.key, mime: storedFile.mime || f.type || "application/octet-stream", size: Number(storedFile.size ?? f.size) || 0 });
      } catch (error) {
        notifyApp(error?.message || `تعذر رفع ${f.name}؛ حاول مرة أخرى.`);
      }
    }
    setProgress(null);
    if (added.length) {
      setTab("project", { ...p, files: [...p.files, ...added] });
      notifyApp(`تمت إضافة ${added.length} ملف للمشروع`);
    }
    if (inputRef.current) inputRef.current.value = "";
  };
  const removeFile = id =>
    confirmDelete("ملف المشروع", () =>
      setTab("project", { ...p, files: p.files.filter(f => f.id !== id) })
    );

  return (
    <div>
      <p style={styles.tabHint}>
        وثّق المشروع أو التطبيق العملي الذي نفذته لتطبيق ما تعلمته.
      </p>
      <label style={styles.fieldLabel}>وصف المشروع</label>
      <RichTextEditor
        style={{ ...styles.input, minHeight: 100, resize: "vertical" }}
        value={desc}
        onChange={value => {
          setDesc(value);
          setTab("project", { ...p, description: value });
        }}
        onBlur={() => setTab("project", { ...p, description: desc })}
        placeholder="ماذا بنيت؟ وكيف طبّقت المفهوم؟"
        ariaLabel="وصف المشروع"
        minHeight={100}
      />

      <label style={styles.fieldLabel}>روابط (مستودع، عرض تجريبي…)</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...styles.input, marginBottom: 0, flex: 1 }}
          value={linkLabel}
          onChange={e => setLinkLabel(e.target.value)}
          placeholder="اسم الرابط"
        />
        <input
          style={{ ...styles.input, marginBottom: 0, flex: 1.4 }}
          value={linkUrl}
          onChange={e => setLinkUrl(e.target.value)}
          placeholder="https://"
        />
        <button
          style={{ ...styles.smallGhostBtn, background: "#2563EB", borderColor: "#2563EB", color: "#FFFFFF" }}
          onClick={addLink}
        >
          <Plus size={16} color="#FFFFFF" />
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 10,
        }}
      >
        {p.links.map(l => (
          <div key={l.id} style={styles.fileRow}>
            <a
              href={l.url}
              rel="noreferrer"
              style={{
                color: accent,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
              }}
            >
              <Link2 size={14} /> {l.label}
            </a>
            <button
              style={styles.smallGhostBtn}
              onClick={() => removeLink(l.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <input ref={inputRef} type="file" multiple hidden disabled={progress !== null} onChange={event => { void onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <button type="button" disabled={progress !== null} onClick={() => inputRef.current?.click()} style={{ ...styles.smallGhostBtn, display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, padding: "10px 14px", color: accent, borderColor: `${accent}88`, opacity: progress !== null ? 0.65 : 1 }}>
        <FileUp size={15} /> {progress !== null ? `جارٍ رفع ملفات المشروع… ${Math.round(progress)}%` : "رفع ملفات للمشروع — كل الأنواع"}
      </button>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 10,
        }}
      >
        {p.files.map(f => (
          <div key={f.id} style={styles.fileRow}>
            <button
              type="button"
              onClick={() => void openAssetInNewTab(safeAssetUrl(f), f.name, f.mime)}
              style={{
                color: COLORS.text,
                fontSize: 12.5,
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                flex: 1,
                minWidth: 0,
                border: 0,
                padding: 0,
                background: "transparent",
                font: "inherit",
                textAlign: "start",
                cursor: "pointer",
              }}
            >
              <Eye size={14} color={accent} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.name}
              </span>
            </button>
            <button
              style={styles.smallGhostBtn}
              onClick={() => removeFile(f.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Style tokens                                                           */
/* ---------------------------------------------------------------------- */

const FONT_HEAD = "'Cairo', 'Tajawal', system-ui, sans-serif";
const FONT_BODY = "'Tajawal', 'Cairo', system-ui, sans-serif";

const DARK_COLORS = {
  bg: "#08111F",
  surface: "#0D1B2A",
  surface2: "#13263A",
  border: "#253B52",
  text: "#F4F7FB",
  textDim: "#9DB0C5",
  teal: "#44E0C2",
  violet: "#9B8AFB",
  blue: "#6FA8FF",
  gold: "#F3C969",
};
const LIGHT_COLORS = {
  bg: "#F5F8FC",
  surface: "#FFFFFF",
  surface2: "#EDF2F7",
  border: "#D9E3EF",
  text: "#132238",
  textDim: "#65768D",
  teal: "#0D8F83",
  violet: "#6B5FD1",
  blue: "#2E6CDF",
  gold: "#A96E0A",
};
const COLORS = { ...DARK_COLORS };
const applyColorTheme = theme =>
  Object.assign(COLORS, theme === "light" ? LIGHT_COLORS : DARK_COLORS);

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&family=Tajawal:wght@300;400;500;700&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes blinkOpacity { 50% { opacity: 0.2; } }
  @keyframes breathe {
    0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.03) inset, 0 12px 40px -14px rgba(47,230,196,0.32), 0 0 50px -18px rgba(139,124,255,0.22); }
    50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.05) inset, 0 14px 46px -12px rgba(47,230,196,0.45), 0 0 60px -14px rgba(139,124,255,0.32); }
  }
  @keyframes tickPulse {
    0% { box-shadow: 0 0 0 0 rgba(47,230,196,0.55), inset 0 1px 0 rgba(255,255,255,0.06); }
    35% { box-shadow: 0 0 16px 2px rgba(47,230,196,0.5), inset 0 1px 0 rgba(255,255,255,0.06); }
    100% { box-shadow: 0 0 0 0 rgba(47,230,196,0), inset 0 1px 0 rgba(255,255,255,0.06); }
  }
  * { box-sizing: border-box; }
  input, textarea, button { font-family: ${FONT_BODY}; }
  input:focus, textarea:focus { outline: none; border-color: ${COLORS.gold} !important; }
  ::placeholder { color: #5C6B6D; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 10px; }

  .glow-blob { position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; z-index: 0; }

  .countdown-glass {
    position: relative;
    background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02));
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(47,230,196,0.28);
  }

  .countdown-digit {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .domainTodayTaskIcon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin-inline-end: 7px; border-radius: 50%; color: #FF6670; background: rgba(255, 77, 88, .12); border: 1px solid rgba(255, 77, 88, .55); vertical-align: -5px; animation: domainIconPulse 1.45s ease-in-out infinite; }
  @keyframes domainIconPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 77, 88, 0); } 50% { box-shadow: 0 0 0 6px rgba(255, 77, 88, .15), 0 0 14px rgba(255, 77, 88, .5); } }
  @media (prefers-reduced-motion: reduce) { .domainTodayTaskIcon { animation: none; box-shadow: 0 0 0 4px rgba(255, 77, 88, .14); } }
  .domainWorkspaceCard, .trackCard { animation: none !important; }

  .status-bar { }
  .settings-option span { display: block; color: ${COLORS.textDim}; font-size: 11px; margin-top: 3px; }
  .settings-option strong { font-size: 13px; }
  .accountRow { display: flex; align-items: center; gap: 11px; padding: 11px; border: 1px solid ${COLORS.border}; border-radius: 13px; background: ${COLORS.surface2}; }
  .accountAvatar { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: 0 0 auto; color: ${COLORS.teal}; background: ${COLORS.teal}18; font-family: ${FONT_HEAD}; font-weight: 800; }
  .accountDetails { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; text-align: start; }
  .accountDetails strong { font-size: 13px; color: ${COLORS.text}; }
  .accountDetails span { font-size: 11px; color: ${COLORS.textDim}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .accountDetails small { font-size: 10px; color: ${COLORS.textDim}; margin-top: 2px; }
  .accountAction { border: 1px solid ${COLORS.teal}66; color: ${COLORS.teal}; background: ${COLORS.teal}12; border-radius: 9px; padding: 8px 10px; cursor: pointer; white-space: nowrap; font-size: 11px; font-weight: 800; }
  .accountAction:active { transform: scale(.97); }
  .accountLogin { border-color: ${COLORS.gold}66; color: ${COLORS.gold}; background: ${COLORS.gold}12; }
  .light-mode { background: #F3F6FB !important; color: #132238 !important; }
  .light-mode .screen-wrap { background: #F3F6FB !important; }
  .light-mode div, .light-mode span, .light-mode p, .light-mode label, .light-mode strong, .light-mode small, .light-mode button { color: #132238 !important; }
  .light-mode .goal-tab-button, .light-mode .manage-deadlines-btn { color: #132238 !important; }
  .light-mode .heroPrimary, .light-mode .daily-plan-btn, .light-mode .primary-btn { color: #FFFFFF !important; }
  .light-mode svg { color: #405671; }
  .light-mode .welcomeCard, .light-mode .chart-wrap, .light-mode .reviewRow, .light-mode .trackCard, .light-mode .domainCard, .light-mode .formCard, .light-mode .settingsHero, .light-mode .settingsSection, .light-mode .dailyCard, .light-mode .reviewScheduleRow, .light-mode .countdownGlass { background: #FFFFFF !important; color: #132238 !important; }
  .light-mode .settingsTitle, .light-mode .settingsSectionTitle, .light-mode .chartValue, .light-mode .welcomeBottom, .light-mode .reviewTitle, .light-mode .trackLabel { color: #132238 !important; }
  .light-mode input, .light-mode textarea, .light-mode select { background: #E8EEF7 !important; color: #132238 !important; border-color: #D4DFEE !important; }
  .light-mode .bottomNav { background: #FFFFFF !important; border-color: #D4DFEE !important; }
  .learningHeroBanner { position: relative; grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 235px; overflow: hidden; padding: 28px 34px; border: 1px solid rgba(103,180,255,.26); border-radius: 24px; background: linear-gradient(90deg, rgba(7,14,27,.18) 0%, rgba(7,14,27,.72) 40%, rgba(7,14,27,.96) 100%), url('/learnhub-hero.png') 38% 52% / cover no-repeat; box-shadow: 0 22px 58px rgba(3,11,24,.25), inset 0 1px rgba(255,255,255,.08); }
  .learningHeroBanner::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 82% 10%, rgba(57,214,193,.18), transparent 32%); }
  .learningHeroContent { position: relative; z-index: 1; width: min(580px, 68%); }
  .learningHeroEyebrow { display: inline-flex; align-items: center; gap: 8px; color: #70E7D4; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
  .learningHeroEyebrow::before { content: ''; width: 20px; height: 1px; background: #70E7D4; }
  .learningHeroBanner h1 { margin: 10px 0 8px; color: #FFFFFF; font-family: ${FONT_HEAD}; font-size: clamp(24px, 3vw, 34px); font-weight: 800; line-height: 1.35; }
  .learningHeroBanner p { max-width: 520px; margin: 0; color: #D5E0ED; font-size: 13px; line-height: 1.85; }
  .learningHeroActions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
  .learningHeroActions button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 15px; border-radius: 11px; font-size: 11px; font-weight: 800; cursor: pointer; transition: transform .18s cubic-bezier(.23,1,.32,1), filter .18s ease; }
  .learningHeroActions button:hover { transform: translateY(-2px); filter: brightness(1.08); }
  .heroPrimary { border: 1px solid #83AFFF; background: linear-gradient(135deg, #3979F6, #2256CC); color: #FFFFFF !important; box-shadow: 0 9px 25px rgba(39,99,220,.3); }
  .heroSecondary { border: 1px solid rgba(255,255,255,.22); background: rgba(9,18,33,.48); color: #F4F7FC !important; backdrop-filter: blur(8px); }
  .light-mode .learningHeroBanner .heroPrimary, .light-mode .learningHeroBanner .heroSecondary { color: #FFFFFF !important; }
  .light-mode .learningHeroBanner p { color: #D5E0ED !important; }
  .light-mode .learningHeroBanner .learningHeroEyebrow, .light-mode .learningHeroBanner .learningHeroMark { color: #9DECDD !important; }
  .learningHeroMark { position: relative; z-index: 1; display: grid; justify-items: center; gap: 8px; min-width: 135px; padding: 16px 17px; border: 1px solid rgba(255,255,255,.2); border-radius: 17px; color: #9DECDD; background: rgba(11,22,39,.54); backdrop-filter: blur(12px); font-size: 10px; font-weight: 700; }
  .welcomeCard, .reviewRow, .reviewScheduleRow, .trackCard, .domainCard, .settingsSection { box-shadow: 0 10px 28px rgba(2,10,24,.11); }
  .workspacePage { width: 100%; max-width: none; margin: 0 auto; }
  .trackWorkspaceHero { display: flex; align-items: center; gap: 18px; min-height: 176px; margin-bottom: 14px; padding: 18px; border: 1px solid ${COLORS.border}; border-radius: 22px; background: radial-gradient(circle at 8% 14%, rgba(56,214,193,.13), transparent 28%), linear-gradient(135deg, ${COLORS.surface}, ${COLORS.surface2}); box-shadow: 0 16px 40px rgba(0,0,0,.13); overflow: hidden; }
  .trackWorkspaceArt { width: 190px; min-width: 190px; height: 140px; border-radius: 18px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 14px 32px rgba(0,0,0,.2); }
  .trackWorkspaceArt img { width: 100%; height: 100%; display: block; object-fit: cover; filter: saturate(.96) contrast(1.04); }
  .trackWorkspaceIcon { display: grid; place-items: center; width: 62px; height: 62px; flex: 0 0 auto; border: 1px solid currentColor; border-radius: 18px; }
  .trackWorkspaceIntro { flex: 1; min-width: 0; }
  .workspaceBreadcrumb { color: ${COLORS.teal}; font-size: 10px; font-weight: 800; }
  .trackWorkspaceIntro h1, .workspaceDetailHeader h1 { margin: 7px 0 4px; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: clamp(24px, 3vw, 33px); font-weight: 800; }
  .trackWorkspaceIntro p, .workspaceDetailHeader p { margin: 0; color: ${COLORS.textDim}; font-size: 12px; line-height: 1.8; }
  .workspaceMetricRow { display: flex; gap: 9px; flex: 0 0 auto; }
  .workspaceMetric { display: grid; gap: 5px; min-width: 75px; padding: 10px 12px; border: 1px solid ${COLORS.border}; border-radius: 13px; background: rgba(255,255,255,.035); text-align: center; }
  .workspaceMetric strong { color: ${COLORS.text}; font-size: 19px; }
  .workspaceMetric span { color: ${COLORS.textDim}; font-size: 10px; }
  .workspacePlanActions { display: flex; gap: 9px; margin: 4px 0 14px; }
  .workspacePlanActions button, .workspacePlannerHeader button, .workspaceBackButton { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; padding: 0 14px; border: 1px solid ${COLORS.border}; border-radius: 11px; background: ${COLORS.surface2}; color: ${COLORS.text}; font-size: 11px; font-weight: 800; cursor: pointer; }
  .workspacePlanActions button:first-child { border-color: ${COLORS.teal}66; background: ${COLORS.teal}12; color: ${COLORS.teal}; }
  .workspacePlanActions button:last-child { border-color: #4E8BFF66; background: #4E8BFF14; color: #8EB5FF; }
  .workspacePlanner { margin: 8px 0 18px; padding: 14px; border: 1px solid ${COLORS.border}; border-radius: 18px; background: ${COLORS.surface}; }
  .workspacePlannerHeader { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; color: ${COLORS.text}; }
  .trackWorkspaceTabs { display: flex; gap: 7px; overflow-x: auto; margin: 6px 0 22px; padding: 3px 1px 8px; scrollbar-width: thin; }
  .trackWorkspaceTabs button { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; min-height: 37px; padding: 0 13px; border: 1px solid ${COLORS.border}; border-radius: 11px; background: ${COLORS.surface}; color: ${COLORS.textDim}; font-size: 11px; font-weight: 700; cursor: pointer; transition: transform .16s ease, background .16s ease; }
  .trackWorkspaceTabs button.active { border-color: var(--track-accent); background: color-mix(in srgb, var(--track-accent) 13%, transparent); color: var(--track-accent); }
  .workspaceSectionHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 17px 0 12px; }
  .workspaceSectionHeading h2 { margin: 0; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 17px; }
  .workspaceSectionHeading p { margin: 4px 0 0; color: ${COLORS.textDim}; font-size: 11px; }
  .workspaceSectionBadge { padding: 6px 10px; border: 1px solid ${COLORS.teal}44; border-radius: 999px; background: ${COLORS.teal}12; color: ${COLORS.teal}; font-size: 10px; font-weight: 800; }
  .domainWorkspaceCard { width: 100%; min-width: 0; height: 100%; }
  .domainWorkspaceCardOpen { min-height: 340px; padding: 24px !important; border-color: ${COLORS.teal}66 !important; background: linear-gradient(150deg, ${COLORS.surface}, ${COLORS.surface2}) !important; box-shadow: 0 18px 42px rgba(0,0,0,.15), 0 0 0 1px ${COLORS.teal}0d; }
  .domainWorkspaceCardOpen > div:first-child > div:first-child > div:first-child { font-size: 25px !important; }
  .domainCardActions { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
  .domainCardActions > span { padding: 5px 8px; border: 1px solid ${COLORS.border}; border-radius: 999px; color: ${COLORS.textDim}; font-size: 10px; white-space: nowrap; }
  .domainCardActions .domainOpenHint { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 0 10px; border: 1px solid ${COLORS.teal}66; border-radius: 10px; background: ${COLORS.teal}12; color: ${COLORS.teal}; font-size: 10px; font-weight: 800; white-space: nowrap; }
  .workspaceDetailHeader { display: grid; grid-template-columns: minmax(180px, .85fr) minmax(0, 1.55fr) auto; grid-template-rows: auto auto; align-items: center; gap: 5px 20px; margin: 0 0 10px; padding: 16px 20px; border: 1px solid ${COLORS.teal}44; border-radius: 22px; background: radial-gradient(circle at 5% 10%, ${COLORS.teal}1a, transparent 30%), linear-gradient(135deg, ${COLORS.surface}, ${COLORS.surface2}); }
  .workspaceDetailHeader .workspaceBreadcrumb { grid-column: 1; grid-row: 1; }
  .workspaceDetailHeader h1 { grid-column: 1; grid-row: 2; margin: 0; }
  .workspaceDetailHeader p { grid-column: 2; grid-row: 1 / span 2; max-width: none; margin: 0; }
  .workspaceDetailHeader .workspaceBackButton { grid-column: 3; grid-row: 1 / span 2; justify-self: end; width: 40px; min-width: 40px; padding: 0; }
  .workspaceDetailHeader .domainTitleProgressRow { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; min-width: 0; }
  .domainTitleProgressRow > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  .domainCompletionBadge { display: inline-flex; align-items: center; flex: 0 0 auto; padding: 5px 10px; border: 1px solid ${COLORS.teal}55; border-radius: 999px; background: ${COLORS.teal}14; color: ${COLORS.teal}; font-size: 11px; font-weight: 800; line-height: 1.2; white-space: nowrap; }
  .light-mode .trackWorkspaceHero, .light-mode .workspaceDetailHeader { background-color: #FFFFFF !important; }
  .light-mode .workspacePlanActions button, .light-mode .workspacePlannerHeader button, .light-mode .workspaceBackButton, .light-mode .trackWorkspaceTabs button { color: #132238 !important; }
  .light-mode .workspacePlanActions button:first-child, .light-mode .domainOpenHint { color: #087F74 !important; }
  .light-mode .workspacePlanActions button:last-child { color: #2563EB !important; }
  .light-mode .trackWorkspaceTabs button.active { color: var(--track-accent) !important; }
  .goal-tab-button:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .goal-tab-button:active { transform: scale(.97); }
  .goal-editor textarea { width: 100%; min-height: 54px; resize: vertical; border: 0; outline: 0; background: transparent; color: ${COLORS.text}; font-size: 13px; line-height: 1.7; padding: 0; }
  .daily-plan-btn { transition: transform .18s ease, filter .18s ease; }
  .daily-plan-btn:hover { transform: translateY(-2px); filter: brightness(1.08); }
  .daily-plan-btn:active { transform: scale(.97); }
  .neon-line { stroke-dasharray: 800; stroke-dashoffset: 800; animation: drawLine 1.1s cubic-bezier(.23,1,.32,1) forwards; }
  .chart-point { animation: pointIn .35s ease both; }
  .modal-backdrop { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(3,8,9,.74); backdrop-filter: blur(10px); animation: fadeIn .2s ease both; }
  .modal-panel { width: min(680px, 100%); background: linear-gradient(145deg, #1b2528, #11191b); border: 1px solid rgba(49,229,192,.3); border-radius: 20px; padding: 20px; box-shadow: 0 30px 90px -25px rgba(0,0,0,.85), 0 0 60px -30px rgba(49,229,192,.5); animation: modalIn .24s cubic-bezier(.23,1,.32,1) both; }
  .modal-panel textarea { width: 100%; min-height: 58px; resize: vertical; background: #121a1c; border: 1px solid #2a3338; border-radius: 9px; padding: 9px 10px; color: #eaf0f0; font-size: 12px; line-height: 1.6; }
  .modal-panel textarea:focus { outline: none; border-color: #31e5c0; }
  .report-panel { max-width: 470px; }
  .report-rows > div { background: #121a1c; border: 1px solid #2a3338; border-radius: 10px; padding: 10px 8px; text-align: center; }
  .report-rows span { display: block; color: #8b9a9c; font-size: 10px; }
  .report-rows strong { display: block; color: #eaf0f0; font-size: 18px; margin-top: 4px; }
  @keyframes drawLine { to { stroke-dashoffset: 0; } }
  @keyframes pointIn { from { opacity: 0; transform: scale(.5); transform-origin: center; } to { opacity: 1; transform: scale(1); transform-origin: center; } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes modalIn { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes alertIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes alertPulse { 70% { box-shadow: 0 0 0 7px rgba(232,196,104,0); } 100% { box-shadow: 0 0 0 0 rgba(232,196,104,0); } }
  .sidebarToggle { display: none !important; }
  @media (max-width: 700px) {
    .learningHeroBanner { min-height: 270px; align-items: flex-end; padding: 22px 20px; background-position: 42% center; }
    .learningHeroContent { width: 100%; }
    .learningHeroMark { display: none; }
    .learningHeroBanner h1 { font-size: 25px; }
    .learningHeroBanner p { font-size: 12px; max-width: 390px; }
    .trackWorkspaceHero { display: grid; grid-template-columns: auto 1fr; gap: 12px; padding: 16px; }
    .trackWorkspaceArt { grid-column: 1 / -1; width: 100%; min-width: 0; height: 118px; order: -1; }
    .trackWorkspaceIcon { width: 48px; height: 48px; border-radius: 14px; }
    .trackWorkspaceIntro h1, .workspaceDetailHeader h1 { font-size: 23px; }
    .workspaceMetricRow { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .workspaceMetric { min-width: 0; padding: 8px 5px; }
    .workspaceMetric strong { font-size: 16px; }
    .workspacePlanActions { display: grid; grid-template-columns: 1fr 1fr; }
    .workspacePlanActions button { padding-inline: 8px; }
    .workspaceDetailHeader { grid-template-columns: 1fr; padding: 18px 16px; }
    .workspaceDetailHeader .workspaceBreadcrumb, .workspaceDetailHeader h1, .workspaceDetailHeader p, .workspaceDetailHeader .workspaceBackButton { grid-column: 1; grid-row: auto; }
    .workspaceDetailHeader .workspaceBackButton { justify-self: start; margin-top: 9px; }
    .domainWorkspaceCardOpen { padding: 16px !important; }
    .domainCardActions { flex-wrap: wrap; justify-content: flex-end; }
  }
  @media (max-width: 420px) {
    .status-bar { flex-direction: column; }
    .status-divider { width: 100% !important; height: 1px !important; align-self: stretch; background: linear-gradient(to right, transparent, rgba(255,255,255,0.14), transparent) !important; }
    .modal-panel { padding: 16px; border-radius: 16px; }
    .plan-grid { grid-template-columns: 1fr; }
    .dailyCards { grid-template-columns: 1fr; }
  }
  @media (min-width: 900px) {
    .app-shell {
      max-width: none !important;
      width: 100vw !important;
      height: 100vh !important;
      margin: 0 !important;
      border-radius: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      background: radial-gradient(ellipse 80% 70% at 70% -10%, #102b27 0%, ${COLORS.bg} 55%), ${COLORS.bg} !important;
    }
    .app-shell .headerWrap { margin-inline-start: 224px; padding: 10px 28px 0; transition: margin .2s ease; }
    .app-shell .screen-wrap, .app-shell .screenWrap { margin-inline-start: 224px; transition: margin .2s ease; }
    .app-shell .screenWrap { padding: 0 22px 24px; }
    .app-shell .bottomNav {
      position: absolute !important;
      inset-block: 0;
      inset-inline-start: 0;
      width: 224px;
      height: 100% !important;
      padding: 24px 16px;
      flex-direction: column;
      justify-content: flex-start !important;
      align-items: stretch;
      gap: 8px;
      border-top: 0 !important;
      border-inline-end: 1px solid ${COLORS.border};
      background: linear-gradient(180deg, ${COLORS.surface}, ${COLORS.bg}) !important;
    }
    .app-shell .bottomNav::before {
      content: "خطة التعلم الذاتية";
      display: block;
      color: ${COLORS.text};
      font-family: ${FONT_HEAD};
      font-size: 20px;
      font-weight: 800;
      padding: 8px 12px 28px;
      border-bottom: 1px solid ${COLORS.border};
      margin-bottom: 8px;
    }
    .app-shell .nav-btn { width: 100%; justify-content: flex-start !important; flex-direction: row !important; gap: 10px !important; padding: 11px 14px !important; border-radius: 13px; }
    .app-shell .nav-btn span { font-size: 13px !important; font-weight: 700; }
    .app-shell .sidebarToggle { display: flex !important; }
    .app-shell.sidebar-collapsed .headerWrap,
    .app-shell.sidebar-collapsed .screenWrap { margin-inline-start: 76px; }
    .app-shell.sidebar-collapsed .bottomNav { width: 76px; padding-inline: 12px; }
    .app-shell.sidebar-collapsed .bottomNav::before { display: none; }
    .app-shell.sidebar-collapsed .nav-btn { justify-content: center !important; padding-inline: 10px !important; }
    .app-shell.sidebar-collapsed .navLabel { display: none; }
    .app-shell .page { max-width: 1180px; margin: 0 auto; padding: 28px 16px 40px; }
    .app-shell .workspacePage { max-width: none; width: 100%; padding: 26px 28px 48px; }
    .app-shell.track-focus .headerWrap,
    .app-shell.track-focus .screenWrap,
    .app-shell.track-focus .screen-wrap { margin-inline-start: 0 !important; }
    .app-shell.track-focus .screenWrap { padding: 0 14px 8px !important; }
    .app-shell .domainFocusWorkspace { padding: 6px 8px 10px !important; }
    .app-shell .domainFocusWorkspace .workspaceSectionHeading { margin: 8px 0; }
    .app-shell .domainFocusWorkspace .domainWorkspaceCardOpen { min-height: max(380px, calc(100vh - 275px)); padding: 28px !important; }
    .app-shell .dashboardPage { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); gap: 22px; align-items: start; }
    .app-shell .dashboardPage > .welcomeCard { grid-column: 1 / -1; }
    .app-shell .dashboardPage > .dashboardReview { grid-column: 1; margin-top: 0 !important; }
    .app-shell .dashboardPage > .dashboardSchedule { grid-column: 2; margin-top: 0 !important; }
    .app-shell .dashboardPage > .dashboardDaily { grid-column: 1 / -1; margin-top: 0 !important; }
    .app-shell .dashboardPage > .dashboardTracks { grid-column: 1 / -1; margin-top: 0 !important; }
    .app-shell .dashboardPage > .dashboardReview > div:last-child { max-height: 360px; overflow-y: auto; padding-inline-end: 4px; }
    .app-shell .dashboardPage > .dashboardSchedule .reviewScheduleList { max-height: 360px; overflow-y: auto; padding-inline-end: 4px; }
    .app-shell .dashboardPage .welcomeCard { padding: 24px 28px 22px; }
    .app-shell .dashboardPage .chartValue { font-size: 32px; }
    .app-shell .dashboardPage .trackGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .app-shell .trackGrid { grid-template-columns: repeat(3, 1fr); }
    .app-shell .dailyCards { grid-template-columns: repeat(3, 1fr); }
    .app-shell .deadlineGrid { grid-template-columns: repeat(3, 1fr); }
    .app-shell .goal-tabs { max-width: 1180px; margin-inline: auto; }
    .app-shell .topWelcome { text-align: start; font-size: 24px; padding-bottom: 8px; }
    .app-shell .countdown-glass { padding: 8px 12px 10px; }
    .app-shell .countdown-row { margin-top: 6px; }
    .app-shell .countdown-board { max-width: 1180px; margin: 0 auto; }
  }
  .dashboardPage {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .dashboardPage > * { margin-top: 0 !important; }
  .learningHeroBanner { width: 100%; align-self: stretch; }
  .dashboardSectionTitle { display: flex; align-items: center; gap: 11px; margin: 4px 2px -7px; color: ${COLORS.text}; }
  .dashboardSectionTitle > span { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid rgba(112, 231, 212, .38); border-radius: 10px; color: #8DF4DF; background: rgba(49, 199, 177, .1); font-size: 10px; font-weight: 900; }
  .dashboardSectionTitle strong { display: block; font-family: ${FONT_HEAD}; font-size: 14px; line-height: 1.35; }
  .dashboardSectionTitle small { display: block; margin-top: 2px; color: ${COLORS.textDim}; font-size: 10px; }
  .dashboardDaily { width: 100%; }
  .dailyMomentumPanel { width: 100%; padding: 18px; border: 1px solid rgba(68,224,194,.24); border-radius: 22px; background: linear-gradient(135deg, rgba(18,44,57,.78), rgba(15,27,48,.72)); box-shadow: 0 18px 42px rgba(3,12,28,.16); animation: learnhub-rise .45s ease both; }
  .middayHabitCard { width: min(92vw, 430px); padding: 24px; border: 1px solid rgba(68,224,194,.35); border-radius: 22px; color: ${COLORS.text}; background: linear-gradient(145deg, rgba(18,44,57,.98), rgba(12,24,42,.98)); box-shadow: 0 24px 70px rgba(0,0,0,.4); animation: learnhub-rise .3s ease both; } .middayHabitEyebrow { display: flex; align-items: center; gap: 6px; color: #8DF4DF; font-size: 11px; font-weight: 900; } .middayHabitCard h2 { margin: 10px 0 6px; font-family: ${FONT_HEAD}; font-size: 20px; } .middayHabitCard p { margin: 0; color: ${COLORS.textDim}; font-size: 12px; line-height: 1.8; } .middayHabitCard p strong { color: ${COLORS.text}; } .middayHabitActions { display: grid; gap: 8px; margin-top: 18px; } .middayHabitActions button { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(128,167,212,.22); border-radius: 11px; padding: 11px 12px; color: ${COLORS.text}; background: rgba(5,14,27,.45); cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; text-align: start; } .middayHabitActions button:hover { border-color: rgba(68,224,194,.6); background: rgba(68,224,194,.08); } .middayHabitActions button:first-child { color: #071311; background: #44E0C2; border-color: #44E0C2; } .middayDismiss { display: block; margin: 14px auto 0; border: 0; color: ${COLORS.textDim}; background: transparent; cursor: pointer; font: inherit; font-size: 10px; }
  .domainExperiencePanel { margin: 0 0 14px; padding: 15px; border: 1px solid; border-radius: 18px; background: linear-gradient(135deg, rgba(18,38,57,.68), rgba(10,20,36,.6)); }
  .domainExperienceHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .domainExperienceToggle { width: 100%; border: 0; padding: 0; color: inherit; background: transparent; cursor: pointer; text-align: start; } .domainExperienceChevron { color: #8DF4DF; font-size: 18px; font-weight: 900; } .domainExperienceStatus { display: flex; justify-content: flex-end; margin: -4px 0 9px; } .domainExperienceEyebrow { display: inline-flex; align-items: center; gap: 5px; color: #8DF4DF; font-size: 10px; font-weight: 900; } .domainExperiencePanel h3 { margin: 5px 0 10px; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 16px; }
  .domainGoalInput { width: 100%; box-sizing: border-box; border: 1px solid rgba(128,167,212,.2); border-radius: 11px; padding: 10px; color: ${COLORS.text}; background: rgba(5,14,27,.42); font: inherit; font-size: 11px; line-height: 1.7; resize: vertical; }
  .domainJourneyMap { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 7px; margin-top: 12px; } .domainJourneyStep { position: relative; padding: 10px 8px; border: 1px solid rgba(128,167,212,.16); border-radius: 11px; background: rgba(5,14,27,.34); } .domainJourneyStep > span { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: ${COLORS.textDim}; background: rgba(128,167,212,.13); font-size: 10px; font-weight: 900; } .domainJourneyStep strong, .domainJourneyStep small { display: block; } .domainJourneyStep strong { margin-top: 6px; color: ${COLORS.text}; font-size: 10.5px; line-height: 1.5; } .domainJourneyStep small { margin-top: 3px; color: ${COLORS.textDim}; font-size: 9px; } .domainJourneyStep.is-done { border-color: rgba(68,224,194,.45); background: rgba(68,224,194,.08); } .domainJourneyStep.is-done > span { color: #071311; background: #44E0C2; }
  .domainSubheading { margin-bottom: 7px; color: ${COLORS.text}; font-size: 11px; font-weight: 900; } .domainNextActions { display: grid; gap: 6px; margin-top: 14px; } .domainNextActions > .domainSubheading { grid-column: 1 / -1; } .domainNextActions button { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(128,167,212,.16); border-radius: 10px; padding: 9px; color: ${COLORS.text}; background: rgba(5,14,27,.34); cursor: pointer; font: inherit; text-align: start; } .domainNextActions button:hover { border-color: rgba(68,224,194,.45); } .domainNextActions button span { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #071311; background: #44E0C2; font-size: 10px; font-weight: 900; } .domainNextActions button strong { flex: 1; font-size: 11px; }
  .domainNextActions button[aria-pressed="true"] { border-color: rgba(68,224,194,.6); background: rgba(68,224,194,.1); } .domainActionGuide { margin-top: 9px; padding: 12px; border: 1px solid rgba(68,224,194,.35); border-radius: 12px; background: rgba(68,224,194,.07); animation: learnhub-rise .22s ease both; } .domainActionGuide > div { display: flex; align-items: center; gap: 6px; color: ${COLORS.text}; font-size: 11px; } .domainActionGuide p { margin: 7px 0 4px; color: ${COLORS.text}; font-size: 11px; line-height: 1.8; } .domainActionGuide small { color: ${COLORS.textDim}; font-size: 9px; }
  .domainActionInput { width: 100%; box-sizing: border-box; margin: 9px 0 7px; border: 1px solid rgba(68,224,194,.3); border-radius: 10px; padding: 10px; color: ${COLORS.text}; background: rgba(5,14,27,.5); font: inherit; font-size: 11px; line-height: 1.8; resize: vertical; outline: none; } .domainActionInput:focus { border-color: rgba(68,224,194,.75); box-shadow: 0 0 0 3px rgba(68,224,194,.08); }
  .domainEvidenceRow { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 7px; margin-top: 14px; } .domainEvidenceRow > div { padding: 9px; border-radius: 10px; background: rgba(5,14,27,.35); } .domainEvidenceRow strong, .domainEvidenceRow small { display: block; } .domainEvidenceRow strong { color: ${COLORS.teal}; font-size: 15px; } .domainEvidenceRow small { margin-top: 3px; color: ${COLORS.textDim}; font-size: 9px; }
  .domainWeeklyReview { margin-top: 14px; }
  .microStageAction { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; padding: 12px 14px; border: 1px solid; border-radius: 15px; background: rgba(15,28,48,.62); } .microStageAction strong, .microStageAction small { display: block; } .microStageAction strong { color: ${COLORS.text}; font-size: 12px; } .microStageAction small { margin-top: 3px; color: ${COLORS.textDim}; font-size: 10px; } .microStageAction button { flex: none; border: 1px solid; border-radius: 9px; padding: 8px 11px; background: transparent; cursor: pointer; font: inherit; font-size: 10px; font-weight: 900; }
  .dailyMomentumHeader, .dailyMomentumActions, .dailyMomentumBottom, .activityStrip { display: flex; gap: 12px; align-items: center; }
  .dailyMomentumHeader { justify-content: space-between; margin-bottom: 14px; }
  .dailyMomentumEyebrow { display: inline-flex; align-items: center; gap: 5px; color: #8DF4DF; font-size: 10px; font-weight: 900; }
  .dailyMomentumPanel h3 { margin: 5px 0 0; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 16px; }
  .achievementsLink { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(201,138,59,.45); border-radius: 10px; padding: 8px 10px; color: #F1C878; background: rgba(201,138,59,.08); cursor: pointer; font: inherit; font-size: 11px; font-weight: 800; }
  .dailyMomentumActions { align-items: stretch; }
  .dailyMomentumActions > button { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 13px; border: 1px solid rgba(128,167,212,.2); border-radius: 15px; color: ${COLORS.text}; background: rgba(6,16,30,.35); text-align: start; cursor: pointer; font: inherit; transition: transform .18s ease, border-color .18s ease, background .18s ease; }
  .dailyMomentumActions > button:hover { transform: translateY(-2px); border-color: rgba(68,224,194,.52); background: rgba(68,224,194,.08); }
  .dailyMomentumActions strong { font-size: 12px; } .dailyMomentumActions small, .challengeCard small, .streakCard small { color: ${COLORS.textDim}; font-size: 10px; line-height: 1.6; }
  .dailyMomentumBottom { align-items: stretch; margin-top: 12px; }
  .challengeCard, .streakCard { flex: 1; min-width: 0; padding: 13px; border-radius: 15px; background: rgba(5,14,27,.42); border: 1px solid rgba(128,167,212,.16); }
  .challengeCard { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; align-items: center; } .challengeCard strong, .challengeCard small { grid-column: 1; }
  .challengeBadge { grid-column: 1 / -1; color: #F1C878; font-size: 10px; font-weight: 900; } .challengeCard button { grid-column: 2; grid-row: 2 / span 2; border: 1px solid rgba(68,224,194,.42); border-radius: 9px; padding: 8px 10px; color: #071311; background: #44E0C2; cursor: pointer; font: inherit; font-size: 10px; font-weight: 900; } .challengeCard button:disabled { opacity: .72; cursor: default; }
  .streakCard { display: grid; grid-template-columns: auto auto 1fr; gap: 0 7px; align-items: center; } .streakCard svg { color: #F1C878; grid-row: span 2; } .streakCard strong { color: #F1C878; font-size: 22px; } .streakCard span { color: ${COLORS.text}; font-size: 11px; font-weight: 800; } .streakCard small { grid-column: 2 / -1; }
  .activityStrip { margin-top: 12px; padding-top: 11px; border-top: 1px solid rgba(128,167,212,.14); font-size: 10px; } .activityStrip span { display: inline-flex; align-items: center; gap: 5px; color: #8DF4DF; font-weight: 900; white-space: nowrap; } .activityStrip strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${COLORS.text}; } .activityStrip small { margin-inline-start: auto; color: ${COLORS.textDim}; white-space: nowrap; }
  .achievementsPage { min-height: 100%; } .achievementsHero { display: flex; align-items: center; gap: 14px; padding: 24px; border: 1px solid rgba(68,224,194,.24); border-radius: 22px; background: linear-gradient(135deg, rgba(18,44,57,.82), rgba(15,27,48,.72)); color: #8DF4DF; } .achievementsHero h1 { margin: 6px 0; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 24px; } .achievementsHero span { font-size: 10px; font-weight: 900; } .achievementsHero p { margin: 0; color: ${COLORS.textDim}; font-size: 12px; } .achievementGrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-top: 18px; } .achievementCard { padding: 18px; border: 1px solid rgba(128,167,212,.17); border-radius: 18px; background: rgba(15,28,48,.72); color: ${COLORS.textDim}; } .achievementCard svg { color: #68768A; } .achievementCard strong { display: block; margin-top: 12px; color: ${COLORS.text}; font-size: 14px; } .achievementCard p { min-height: 42px; margin: 8px 0 12px; font-size: 11px; line-height: 1.7; } .achievementCard small { font-size: 10px; } .achievementCard.is-earned { border-color: rgba(68,224,194,.5); box-shadow: 0 10px 30px rgba(68,224,194,.08); } .achievementCard.is-earned svg, .achievementCard.is-earned small { color: #44E0C2; }
  @keyframes learnhub-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .app-shell .dashboardPage { display: flex !important; flex-direction: column; width: 100%; }
  .dashboardControlColumns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: start; width: 100%; }
  .dashboardControlMain { grid-column: span 2; min-width: 0; }
  .dashboardThirdColumn { display: grid; gap: 14px; min-width: 0; }
  .dashboardThirdColumn > * { margin-top: 0 !important; }
  .dashboardThirdColumn .dashboardSectionTitle { margin-top: 2px !important; }
  .dashboardThirdColumn .dailySuccessQuote { padding: 16px 17px !important; border-radius: 18px !important; }
  .dashboardThirdColumn .dashboardReview, .dashboardThirdColumn .dashboardSchedule { padding: 14px 15px; border-radius: 18px; }
  .dashboardReviewRow { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; align-items: start; width: 100%; }
  .dashboardReviewRow > .dashboardReview, .dashboardReviewRow > .dashboardSchedule { margin-top: 0 !important; min-width: 0; }
  .dashboardTracks { width: 100%; align-self: stretch; }
  @media (max-width: 900px) {
    .dashboardControlColumns { grid-template-columns: 1fr; }
    .dashboardControlMain { grid-column: auto; }
    .dashboardReviewRow { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .achievementGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 620px) { .dailyMomentumActions, .dailyMomentumBottom { flex-direction: column; } .dailyMomentumActions > button { flex: none; } .activityStrip { align-items: flex-start; flex-wrap: wrap; } .activityStrip strong { flex-basis: 100%; } .achievementGrid { grid-template-columns: 1fr; } }
  @media (max-width: 620px) { .domainJourneyMap, .domainEvidenceRow { grid-template-columns: repeat(2, minmax(0,1fr)); } .domainExperienceHeader { align-items: flex-start; flex-direction: column; } }
  .dashboardPage::before,
  .dashboardPage::after {
    content: "";
    position: absolute;
    z-index: -1;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(80px);
    opacity: .34;
  }
  .dashboardPage::before { width: 240px; height: 240px; inset-inline-end: 3%; top: 4%; background: #32D6C1; }
  .dashboardPage::after { width: 210px; height: 210px; inset-inline-start: 8%; top: 33%; background: #6C63FF; }
  .learningHeroBanner {
    min-height: 340px;
    padding: 34px 38px;
    border-radius: 26px;
    border-color: rgba(119, 217, 255, .28);
    background-image: linear-gradient(270deg, rgba(5, 12, 25, .97) 0%, rgba(5, 12, 25, .84) 34%, rgba(5, 12, 25, .18) 78%), url('/learnhub-hero.png');
    background-position: center;
    box-shadow: 0 26px 68px rgba(2, 10, 24, .32), inset 0 1px 0 rgba(255,255,255,.12);
  }
  .learningHeroBanner::before { content: ""; position: absolute; inset: 1px; border-radius: 29px; border: 1px solid rgba(255,255,255,.08); pointer-events: none; }
  .learningHeroBanner::after { background: radial-gradient(circle at 74% 18%, rgba(76, 235, 207, .28), transparent 23%), linear-gradient(180deg, transparent 35%, rgba(3, 8, 19, .36)); }
  .learningHeroContent { width: min(620px, 70%); }
  .learningHeroEyebrow { color: #8DF4DF; font-size: 11px; letter-spacing: .05em; }
  .learningHeroEyebrow::before { width: 32px; height: 2px; background: linear-gradient(90deg, #8DF4DF, #4B8CFF); }
  .learningHeroBanner h1 { max-width: 620px; margin-top: 13px; font-size: clamp(28px, 3.7vw, 44px); line-height: 1.28; letter-spacing: -.02em; text-shadow: 0 8px 30px rgba(0,0,0,.28); }
  .learningHeroBanner p { max-width: 540px; color: #DDEAF7; font-size: 13px; line-height: 1.8; }
  .learningHeroKpis { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .learningHeroKpis > div { display: grid; gap: 3px; min-width: 110px; padding: 10px 13px; border: 1px solid rgba(151, 218, 255, .22); border-radius: 13px; background: rgba(7, 18, 36, .48); box-shadow: inset 0 1px rgba(255,255,255,.08); backdrop-filter: blur(12px); }
  .learningHeroKpis strong { color: #FFFFFF; font-family: ${FONT_HEAD}; font-size: 20px; line-height: 1; }
  .learningHeroKpis span { color: #A9C1D8; font-size: 10px; }
  .learningHeroActions { margin-top: 22px; }
  .learningHeroActions button { min-height: 44px; padding-inline: 17px; border-radius: 13px; }
  .heroPrimary { background: linear-gradient(135deg, #42D9C3, #237EDB); border-color: rgba(155,255,235,.6); color: #061524 !important; box-shadow: 0 12px 30px rgba(35, 181, 206, .28); }
  .heroSecondary { background: rgba(6, 17, 34, .52); border-color: rgba(180, 222, 255, .32); }
  .learningHeroMark { min-width: 178px; padding: 20px 18px; border-radius: 24px; border-color: rgba(149, 235, 224, .36); background: linear-gradient(145deg, rgba(11,31,51,.7), rgba(14,34,46,.38)); box-shadow: 0 18px 50px rgba(3, 12, 25, .3); }
  .learningHeroMark strong { color: #FFFFFF; font-size: 12px; }
  .learningHeroMark span { color: #A6C2D5; font-size: 10px; }
  .learningHeroOrb { display: grid; place-items: center; width: 68px; height: 68px; border: 1px solid rgba(147, 255, 230, .62); border-radius: 22px; color: #A6FFF0; background: radial-gradient(circle at 30% 25%, #58E5D0, #1E5B83 70%); box-shadow: 0 0 0 8px rgba(69, 221, 198, .08), 0 0 34px rgba(69, 221, 198, .34); }
  .welcomeCard { border: 1px solid rgba(128, 167, 212, .2) !important; border-radius: 24px !important; background: linear-gradient(145deg, rgba(21, 36, 59, .94), rgba(13, 24, 42, .9)) !important; box-shadow: 0 18px 48px rgba(3, 12, 28, .2) !important; }
  .dashboardReview, .dashboardSchedule { padding: 18px 20px; border: 1px solid rgba(128, 167, 212, .18); border-radius: 22px; background: linear-gradient(145deg, rgba(17, 31, 52, .82), rgba(10, 20, 36, .76)); box-shadow: 0 16px 38px rgba(3, 12, 28, .16); }
  .dashboardReview > button, .dashboardSchedule > button { padding: 2px 0 12px !important; }
  .dashboardReview > button strong, .dashboardSchedule > button strong { font-family: ${FONT_HEAD}; font-size: 17px !important; }
  .dashboardTracks { padding: 18px; border: 1px solid rgba(128, 167, 212, .18); border-radius: 22px; background: linear-gradient(145deg, rgba(15, 28, 48, .72), rgba(10, 19, 34, .64)); }
  .dashboardTracks .trackGrid { margin-top: 15px; }
  .trackCard { position: relative; overflow: hidden; min-height: 242px; padding: 11px 12px 16px !important; border-radius: 22px !important; border-color: rgba(255,255,255,.12) !important; box-shadow: inset 0 1px rgba(255,255,255,.08), 0 15px 32px rgba(2, 8, 18, .16) !important; transition: transform .2s cubic-bezier(.23,1,.32,1), border-color .2s ease, box-shadow .2s ease; }
  .trackCard::after { content: ""; position: absolute; width: 110px; height: 110px; inset-inline-end: -32px; bottom: -42px; border-radius: 50%; background: currentColor; opacity: .1; filter: blur(2px); }
  .trackCard > * { position: relative; z-index: 1; }
  .trackCover { position: relative !important; z-index: 0 !important; overflow: hidden; height: 100px; margin: -11px -12px 2px; border-radius: 20px 20px 12px 12px; background: rgba(0,0,0,.18); }
  .trackCover::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,12,25,.02) 22%, rgba(5,12,25,.72) 100%), linear-gradient(90deg, rgba(5,12,25,.18), transparent 58%); }
  .trackCover img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center; filter: saturate(.92) contrast(1.04); transition: transform .35s cubic-bezier(.23,1,.32,1), filter .25s ease; }
  .trackCard:hover { transform: translateY(-4px); border-color: currentColor !important; box-shadow: inset 0 1px rgba(255,255,255,.12), 0 20px 40px rgba(2, 8, 18, .26) !important; }
  .trackCard:hover .trackCover img { transform: scale(1.06); filter: saturate(1.08) contrast(1.05); }
  .treeChildrenSaved { position: relative; }
  .treeChildrenSaved::before { content: ""; position: absolute; top: 22px; left: 92px; right: 92px; border-top: 2.5px solid currentColor; opacity: .76; transform: rotate(-.5deg); filter: drop-shadow(1px 1px 0 rgba(88, 70, 45, .16)); }
  .treeParentStem { position: absolute; top: -1px; left: 50%; width: 44px; height: 26px; transform: translateX(-50%) rotate(1deg); z-index: 2; pointer-events: none; }
  .treeParentStem svg { width: 44px; height: 26px; overflow: visible; }
  .treeHandArrow { position: absolute; top: 22px; inset-inline-start: 50%; width: 82px; height: 58px; display: grid; place-items: center; opacity: .9; transform: translateX(-50%) rotate(-2deg); filter: drop-shadow(1px 2px 0 rgba(88, 70, 45, .18)); margin: 0; z-index: 2; pointer-events: none; }
  .treeHandArrow svg { width: 82px; height: 58px; overflow: visible; }
  .savedMindMapCanvas { position: relative; min-width: 100%; overflow: visible; }
  .savedMindMapLinks { position: absolute; inset: 0; z-index: 1; overflow: visible; pointer-events: none; }
  .savedMindMapNode { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; padding: 12px 16px; border: 2px solid; border-radius: 13px 10px 15px 9px; box-shadow: 2px 3px 0 #B7A98D; font-family: "Kalam", "Patrick Hand", "Comic Sans MS", cursive; font-size: 16px; line-height: 1.55; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; transform: rotate(-.35deg); }
  .savedMindMapWrap { width: 100%; min-width: 0; }
  .mindmapInner { width: max-content; min-width: 100%; display: flex; justify-content: center; align-items: flex-start; }
  .mindmapInner > .treeNodeWrap { flex: 0 0 auto; }
  .savedMindMapToolbar { display: flex; align-items: center; justify-content: flex-start; gap: 7px; margin: 0 0 12px; padding: 7px 9px; border: 1px solid ${COLORS.border}; border-radius: 11px; background: ${COLORS.surface2}; color: ${COLORS.textDim}; font-size: 11px; }
  .savedMindMapToolbar button { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid ${COLORS.border}; border-radius: 8px; background: ${COLORS.surface}; color: ${COLORS.text}; font-size: 18px; line-height: 1; cursor: pointer; }
  .savedMindMapToolbar button:hover { border-color: ${COLORS.teal}; color: ${COLORS.teal}; }
  .savedMindMapToolbar strong { min-width: 42px; color: ${COLORS.teal}; text-align: center; font-size: 11px; }
  .savedMindMapStage { position: relative; margin: 0 auto; transition: width .18s ease, height .18s ease; }
  .assistantLauncher { position: fixed; inset-inline-end: 20px; bottom: 18px; z-index: 120; display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 0 15px; border: 1px solid rgba(49,229,192,.48); border-radius: 999px; color: #062A27; background: linear-gradient(135deg, #55DEC9, #31E5C0); box-shadow: 0 12px 28px rgba(3,10,24,.28), 0 0 22px rgba(49,229,192,.18); font-size: 11px; font-weight: 900; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
  .assistantLauncher:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(3,10,24,.34), 0 0 28px rgba(49,229,192,.28); }
  .personalAssistantPanel { margin: 0 auto 18px; width: min(100%, 980px); border: 1px solid rgba(49,229,192,.28); border-radius: 22px; overflow: hidden; background: linear-gradient(145deg, rgba(15,31,43,.96), rgba(16,25,44,.96)); box-shadow: 0 18px 42px rgba(3,10,24,.16); }
  .personalAssistantPanel.assistantOpen { position: fixed; inset-inline-end: 20px; bottom: 18px; z-index: 119; width: min(980px, calc(100vw - 40px)); max-height: calc(100vh - 36px); margin: 0; box-shadow: 0 22px 60px rgba(3,10,24,.42); }
  .personalAssistantHeader { display: flex; align-items: center; gap: 13px; padding: 16px 18px; background: radial-gradient(circle at 8% 20%, rgba(49,229,192,.16), transparent 30%), linear-gradient(135deg, rgba(49,229,192,.08), rgba(193,140,255,.08)); }
  .personalAssistantOrb { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 auto; border: 1px solid rgba(49,229,192,.42); border-radius: 14px; color: #70E7D4; background: rgba(49,229,192,.13); box-shadow: 0 0 24px rgba(49,229,192,.14); }
  .personalAssistantCopy { min-width: 0; flex: 1; }
  .personalAssistantKicker { color: #70E7D4; font-size: 9px; font-weight: 900; letter-spacing: .06em; }
  .personalAssistantCopy h2 { margin: 3px 0 3px; color: #F3FFFC; font-family: ${FONT_HEAD}; font-size: 19px; }
  .personalAssistantCopy p { margin: 0; color: rgba(225,240,239,.7); font-size: 10px; line-height: 1.6; }
  .personalAssistantActions { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; }
  .assistantIconButton, .assistantVoiceButton { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; border: 1px solid rgba(49,229,192,.32); border-radius: 9px; color: #A8F1E3; background: rgba(49,229,192,.1); font-size: 10px; font-weight: 800; cursor: pointer; }
  .assistantIconButton { width: 32px; padding: 0; }
  .assistantVoiceButton { padding: 0 10px; }
  .assistantVoiceButton.recording { border-color: rgba(224,113,154,.6); color: #FFB4CC; background: rgba(224,113,154,.16); }
  .assistantVoiceButton:disabled { opacity: .65; cursor: wait; }
  .assistantSpin { animation: spin .9s linear infinite; }
  .assistantContextStrip { display: flex; align-items: center; gap: 7px; padding: 7px 16px; border-top: 1px solid rgba(255,255,255,.06); border-bottom: 1px solid rgba(255,255,255,.06); color: rgba(225,240,239,.62); font-size: 9px; }
  .assistantStatusDot { width: 6px; height: 6px; border-radius: 50%; background: #31E5C0; box-shadow: 0 0 9px #31E5C0; }
  .assistantPrivacy { margin-inline-start: auto; color: rgba(225,240,239,.42); }
  .personalAssistantChat { border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; }
  .personalAssistantChat form { background: rgba(5,14,25,.35) !important; border-color: rgba(255,255,255,.06) !important; }
  .personalAssistantChat textarea { color: #EAF7F4 !important; caret-color: #31E5C0; background: rgba(255,255,255,.07) !important; border-color: rgba(126,220,207,.28) !important; }
  .personalAssistantChat textarea::placeholder { color: rgba(225,240,239,.56) !important; }
  .personalAssistantChat [data-radix-scroll-area-viewport] { color: #EAF7F4; }
  .personalAssistantChat .bg-muted { color: #EAF7F4 !important; background: rgba(255,255,255,.09) !important; }
  .personalAssistantChat .bg-primary { color: #062A27 !important; background: #55DEC9 !important; }
  .light-mode .personalAssistantPanel { background: linear-gradient(145deg, #FFFFFF, #F2F7FC); border-color: #B8E9E1; }
  .light-mode .personalAssistantCopy h2 { color: #132238; }
  .light-mode .personalAssistantCopy p, .light-mode .assistantContextStrip { color: #53677F; }
  .light-mode .personalAssistantChat textarea { color: #132238 !important; background: #FFFFFF !important; border-color: #B8E9E1 !important; }
  .light-mode .personalAssistantChat textarea::placeholder { color: #71839A !important; }
  .light-mode .personalAssistantChat [data-radix-scroll-area-viewport] { color: #132238; }
  .light-mode .personalAssistantChat .bg-muted { color: #132238 !important; background: #EAF2F7 !important; }
  @media (max-width: 700px) { .assistantLauncher { inset-inline-end: 12px; bottom: 12px; } .personalAssistantPanel.assistantOpen { inset-inline-end: 12px; bottom: 12px; width: calc(100vw - 24px); max-height: calc(100vh - 24px); } .personalAssistantHeader { align-items: flex-start; flex-wrap: wrap; padding: 13px; } .personalAssistantActions { width: 100%; margin-inline-start: 57px; } .assistantVoiceButton { flex: 1; } .assistantPrivacy { display: none; } }
  .thoughtsScreen { width: min(100%, 850px); min-height: 100%; padding-inline: clamp(12px, 2vw, 24px) !important; box-sizing: border-box; }
  .thoughtsHero { display: flex; align-items: center; gap: 12px; min-height: 74px; margin-bottom: 10px; padding: 10px 12px; border: 1px solid rgba(193,140,255,.22); border-radius: 14px; background: linear-gradient(135deg, rgba(38,29,63,.94), rgba(15,28,49,.92)); box-shadow: 0 9px 22px rgba(3,10,24,.14); }
  .thoughtsHeroIcon { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 auto; border: 1px solid rgba(193,140,255,.42); border-radius: 10px; color: #D6B8FF; background: rgba(193,140,255,.14); }
  .thoughtsHeroCopy { min-width: 0; flex: 1; }
  .thoughtsHeroKicker { color: ${COLORS.violet}; font-size: 8px; font-weight: 900; letter-spacing: .06em; }
  .thoughtsHero h1 { margin: 2px 0 1px; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 18px; line-height: 1.2; }
  .thoughtsHero p { margin: 0; color: ${COLORS.textDim}; font-size: 9.5px; line-height: 1.5; }
  .thoughtsAddButton { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 30px; padding: 0 10px; flex: 0 0 auto; border: 1px solid rgba(193,140,255,.45); border-radius: 9px; background: linear-gradient(135deg, #9C8AD9, #6C63FF); color: #fff; font-size: 10px; font-weight: 800; cursor: pointer; box-shadow: 0 7px 16px rgba(108,99,255,.18); }
  .thoughtsStats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; }
  .thoughtsStats span { display: inline-flex; align-items: center; gap: 4px; min-height: 20px; padding: 0 7px; border: 1px solid rgba(128,167,212,.18); border-radius: 999px; background: rgba(20,31,52,.58); color: ${COLORS.textDim}; font-size: 8px; }
  .thoughtsStats span:first-child { border-color: rgba(193,140,255,.3); color: ${COLORS.violet}; }
  .thoughtsStats strong { color: ${COLORS.text}; font-size: 10px; }
  .thoughtsGrid { display: grid; grid-template-columns: 1fr; gap: 7px; }
  .thoughtCard { position: relative; overflow: hidden; border: 1px solid rgba(193,140,255,.24); border-radius: 12px; background: linear-gradient(145deg, rgba(27,35,57,.92), rgba(15,23,40,.86)); box-shadow: 0 8px 18px rgba(3,10,24,.12); transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
  .thoughtCard:hover { transform: translateY(-1px); border-color: rgba(193,140,255,.48); box-shadow: 0 13px 25px rgba(3,10,24,.18); }
  .thoughtCardOpen { border-color: rgba(193,140,255,.48); }
  .thoughtFoldHeader { min-height: 52px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 9px; cursor: pointer; user-select: none; }
  .thoughtFoldTitleGroup { min-width: 0; display: flex; align-items: center; gap: 7px; flex: 1; }
  .thoughtFoldIndex { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 auto; border-radius: 7px; color: ${COLORS.violet}; background: rgba(193,140,255,.12); font-size: 8px; font-weight: 900; }
  .thoughtFoldTitleGroup input { min-width: 0; width: min(480px, 100%); padding: 0; border: 0; outline: none; background: transparent; color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 13px; font-weight: 800; }
  .thoughtFoldTitleGroup input::placeholder { color: ${COLORS.textDim}; opacity: .9; }
  .thoughtFoldCategory { display: inline-flex; align-items: center; min-height: 18px; padding: 0 6px; border: 1px solid rgba(193,140,255,.2); border-radius: 999px; color: ${COLORS.textDim}; font-size: 8px; white-space: nowrap; }
  .thoughtFoldActions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .thoughtFoldChevron { color: ${COLORS.violet}; font-size: 18px; line-height: 1; }
  .thoughtDeleteButton { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid rgba(224,113,154,.28); border-radius: 7px; color: ${COLORS.danger}; background: rgba(224,113,154,.07); cursor: pointer; }
  .thoughtFoldBody { padding: 8px; border-top: 1px solid ${COLORS.border}; }
  .thoughtFields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 7px; margin-bottom: 7px; }
  .thoughtFields label { display: flex; flex-direction: column; gap: 3px; color: ${COLORS.textDim}; font-size: 9px; font-weight: 700; }
  .thoughtFields input { width: 100%; box-sizing: border-box; min-height: 31px; padding: 6px 8px; border: 1px solid rgba(193,140,255,.22); border-radius: 8px; background: rgba(8,16,31,.38); color: ${COLORS.text}; font-size: 10px; }
  .thoughtFoldBody > textarea { width: 100%; min-height: 92px; box-sizing: border-box; resize: vertical; padding: 8px 9px; border: 1px solid rgba(193,140,255,.22); border-radius: 9px; outline: none; background: rgba(8,16,31,.28); color: ${COLORS.text}; font-family: ${FONT_BODY}; font-size: 10px; line-height: 1.7; }
  .thoughtCardMeta { margin-top: 5px; color: ${COLORS.textDim}; font-size: 8px; }
  .thoughtsEmpty { display: grid; justify-items: center; gap: 7px; padding: 38px 18px; border: 1px dashed rgba(193,140,255,.28); border-radius: 14px; background: rgba(18,28,48,.44); text-align: center; }
  .thoughtsEmptyIcon { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid rgba(193,140,255,.34); border-radius: 12px; color: ${COLORS.violet}; background: rgba(193,140,255,.1); }
  .thoughtsEmpty strong { color: ${COLORS.text}; font-family: ${FONT_HEAD}; font-size: 14px; }
  .thoughtsEmpty span { color: ${COLORS.textDim}; font-size: 10px; }
  .light-mode .thoughtCard { background: linear-gradient(145deg, #FFFFFF, #F5F8FC); }
  @media (max-width: 700px) { .thoughtFields { grid-template-columns: 1fr; } .thoughtsNote { line-height: 1.7; } }
  .trackIconWrap { width: 45px !important; height: 45px !important; border-radius: 14px !important; box-shadow: 0 8px 22px currentColor; }
  .trackLabel { font-size: 16px !important; letter-spacing: -.01em; }
  .trackMeta { font-size: 11.5px !important; line-height: 1.7; }
  @media (max-width: 700px) {
    .learningHeroBanner { min-height: 430px; padding: 24px 21px; background-position: 64% center; }
    .learningHeroContent { width: 100%; }
    .learningHeroBanner h1 { font-size: 29px; }
    .learningHeroBanner p { font-size: 12.5px; }
    .learningHeroKpis > div { min-width: 0; flex: 1; padding-inline: 9px; }
    .learningHeroKpis strong { font-size: 17px; }
    .learningHeroMark { display: flex; align-items: center; gap: 10px; min-width: 0; width: fit-content; padding: 9px 12px; margin-top: 7px; }
    .learningHeroOrb { width: 38px; height: 38px; border-radius: 12px; }
    .learningHeroOrb svg { width: 19px; height: 19px; }
    .learningHeroMark span { display: none; }
    .dashboardReview, .dashboardSchedule, .dashboardTracks { padding: 14px 12px; border-radius: 18px; }
    .trackCard { min-height: 210px; padding: 9px 10px 14px !important; }
    .trackCover { height: 82px; margin: -9px -10px 2px; border-radius: 16px 16px 10px 10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .trackCard, .learningHeroActions button { transition: none !important; }
  }
  .studyTimerCard {
    width: min(100%, 340px) !important;
    margin-top: 12px !important;
    padding: 11px 12px !important;
    border-radius: 16px !important;
    border-color: rgba(232,196,104,.28) !important;
    background: linear-gradient(145deg, rgba(23,36,54,.92), rgba(13,24,40,.88)) !important;
    box-shadow: 0 12px 28px rgba(3, 10, 24, .16) !important;
  }
  .daily-spotlight {
    grid-column: auto !important;
    width: 100%;
    padding: 20px !important;
    border-radius: 22px !important;
    background: linear-gradient(135deg, rgba(42, 214, 193, .13), rgba(101, 92, 220, .13)) !important;
    box-shadow: 0 18px 42px rgba(3, 12, 28, .16), inset 0 1px rgba(255,255,255,.08);
  }
  .studyTimerCard.is-collapsed {
    width: 58px !important;
    height: 54px !important;
    min-height: 54px !important;
    padding: 0 !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 17px !important;
    cursor: pointer;
  }
  .studyTimerCard.is-collapsed > div:first-child { width: 100%; height: 100%; justify-content: center !important; }
  .studyTimerCard.is-collapsed > div:first-child > div:first-child { font-size: 0 !important; justify-content: center; }
  .studyTimerCard.is-collapsed > div:first-child > div:first-child svg { width: 25px; height: 25px; filter: drop-shadow(0 0 8px rgba(232,196,104,.55)); }
  .studyTimerCard.is-collapsed > div:first-child > span { font-size: 0 !important; }
  .studyTimerCard.is-collapsed:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(232,196,104,.2) !important; }
  .tracksHeadingRow { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .tracksHeadingRow > div:first-child { min-width: 0; flex: 1; }
  .tracksHeadingRow .studyTimerCard { flex: 0 0 auto; margin-top: 0 !important; }
  .tracksHeadingRow .studyTimerCard.is-expanded { position: absolute; inset-inline-start: 0; top: 58px; z-index: 40; }
  .studyTimerCard > div:first-child { align-items: center !important; }
  .studyTimerCard > div:first-child > div:first-child > div:first-child { font-size: 12px !important; }
  .studyTimerDetails > div:first-child { gap: 10px !important; margin: 10px 0 9px !important; }
  .studyTimerDetails > div:first-child > div:first-child { font-size: 30px !important; letter-spacing: 1px !important; }
  .studyTimerDetails > div:last-child { margin-top: 9px !important; }
  .studyTimerDetails button { min-height: 32px !important; padding: 5px 9px !important; font-size: 10px !important; }
  @media (max-width: 700px) {
    .daily-spotlight { padding: 15px !important; }
    .studyTimerCard.is-expanded { width: 100% !important; max-width: none !important; }
    .tracksHeadingRow .studyTimerCard.is-expanded { inset-inline: 0; top: 58px; }
  }

  /* LearnHub visual system — calm, editorial, and focused */
  html, body, #root { min-height: 100%; }
  body { margin: 0; background: #06101D; color: #F4F7FB; }
  .app-shell {
    isolation: isolate;
    background:
      radial-gradient(circle at 78% -8%, rgba(68,224,194,.16), transparent 27%),
      radial-gradient(circle at 14% 18%, rgba(155,138,251,.12), transparent 25%),
      linear-gradient(135deg, #08111F 0%, #0A1727 52%, #07101D 100%) !important;
    border-color: rgba(116, 164, 205, .22) !important;
  }
  .app-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: .17;
    background-image:
      linear-gradient(rgba(157,176,197,.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(157,176,197,.07) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: linear-gradient(to bottom, black, transparent 78%);
  }
  .app-shell .glow-blob { opacity: .11; filter: blur(78px); }
  .app-shell .screenWrap { scrollbar-color: #253B52 transparent; }
  .headerWrap { padding: 16px 22px 0 !important; }
  .topWelcome { letter-spacing: -.02em; color: #F4F7FB !important; }
  .countdown-board {
    border: 1px solid rgba(116,164,205,.22) !important;
    background: rgba(13,27,42,.72) !important;
    box-shadow: 0 18px 44px rgba(2,9,20,.22), inset 0 1px rgba(255,255,255,.05);
    backdrop-filter: blur(18px);
  }
  .countdown-board:hover { border-color: rgba(68,224,194,.38) !important; }
  .countdown-glass { background: linear-gradient(145deg, rgba(255,255,255,.07), rgba(255,255,255,.018)) !important; }
  .page { padding-top: 26px !important; }
  .settingsHero, .settingsSection, .welcomeCard, .domainCard, .formCard, .reviewRow, .reviewScheduleRow, .trackCard, .dashboardReview, .dashboardSchedule, .dashboardTracks {
    border-color: rgba(116,164,205,.2) !important;
    box-shadow: 0 18px 45px rgba(2,9,20,.15), inset 0 1px rgba(255,255,255,.035) !important;
  }
  .settingsHero {
    background: linear-gradient(135deg, rgba(18,42,59,.95), rgba(13,27,42,.92)) !important;
    padding: 20px !important;
  }
  .settingsIcon { border: 1px solid rgba(68,224,194,.3); box-shadow: 0 0 0 7px rgba(68,224,194,.045); }
  .settingsTitle, .workspaceDetailHeader h1, .trackWorkspaceIntro h1 { letter-spacing: -.02em; }
  .settingsSection { background: rgba(13,27,42,.82) !important; }
  .input, input, textarea, select { border-radius: 12px !important; }
  .input:focus, input:focus, textarea:focus, select:focus { box-shadow: 0 0 0 4px rgba(68,224,194,.1); }
  .primaryBtn { border-radius: 12px !important; background: linear-gradient(135deg, #44E0C2, #2B9ED7) !important; color: #06151D !important; box-shadow: 0 10px 24px rgba(68,224,194,.18); transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
  .primaryBtn:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 14px 30px rgba(68,224,194,.26); }
  .smallGhostBtn, .ghostBtn { transition: transform .18s ease, border-color .18s ease, background .18s ease; }
  .smallGhostBtn:hover, .ghostBtn:hover { transform: translateY(-1px); border-color: rgba(68,224,194,.46) !important; background: rgba(68,224,194,.08); }
  .bottomNav {
    background: linear-gradient(180deg, rgba(13,27,42,.97), rgba(7,16,29,.98)) !important;
    border-color: rgba(116,164,205,.2) !important;
    box-shadow: 12px 0 40px rgba(2,9,20,.16);
  }
  .nav-btn { border: 1px solid transparent !important; border-radius: 14px !important; transition: transform .18s ease, background .18s ease, border-color .18s ease; }
  .nav-btn:hover { transform: translateX(-2px); background: rgba(68,224,194,.07) !important; border-color: rgba(68,224,194,.18) !important; }
  .sidebarToggle:hover { border-color: rgba(68,224,194,.4) !important; color: #44E0C2 !important; }
  .app-shell .bottomNav::before { content: "LearnHub" !important; color: #F4F7FB !important; font-size: 24px !important; letter-spacing: -.04em; background: linear-gradient(135deg, #F4F7FB 35%, #44E0C2 82%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .app-shell .bottomNav::after { content: "لوحة تعلمك اليومية"; display: block; order: 0; margin: -5px 12px 12px; color: #7F95AD; font-size: 10px; font-weight: 700; letter-spacing: .02em; }
  .learningHeroBanner { border-color: rgba(68,224,194,.25) !important; box-shadow: 0 28px 72px rgba(2,9,20,.34), inset 0 1px rgba(255,255,255,.1) !important; }
  .learningHeroBanner h1 { letter-spacing: -.04em; }
  .learningHeroKpis > div { border-color: rgba(116,164,205,.2) !important; background: rgba(7,16,29,.55) !important; }
  .learningHeroKpis strong { color: #F4F7FB !important; }
  .trackCard:hover, .domainCard:hover, .reviewScheduleRow:hover { transform: translateY(-3px); border-color: rgba(68,224,194,.4) !important; box-shadow: 0 22px 44px rgba(2,9,20,.24) !important; }
  .trackCard, .domainCard, .reviewScheduleRow { transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
  .workspaceDetailHeader, .trackWorkspaceHero { box-shadow: 0 22px 54px rgba(2,9,20,.2), inset 0 1px rgba(255,255,255,.05); }
  .modal-panel { background: linear-gradient(145deg, #122535, #0B1828) !important; border-color: rgba(68,224,194,.34) !important; box-shadow: 0 30px 100px rgba(0,0,0,.58), 0 0 70px rgba(68,224,194,.12) !important; }
  .fileRow { background: rgba(13,27,42,.78) !important; border-color: rgba(116,164,205,.2) !important; transition: border-color .18s ease, transform .18s ease; }
  .fileRow:hover { transform: translateY(-1px); border-color: rgba(68,224,194,.4) !important; }
  .light-mode body { background: #F5F8FC; }
  .light-mode .app-shell { background: radial-gradient(circle at 80% -10%, rgba(68,224,194,.13), transparent 28%), linear-gradient(135deg, #F7FAFD, #EEF4F8) !important; }
  .light-mode .app-shell::before { opacity: .22; background-image: linear-gradient(rgba(44,79,112,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(44,79,112,.06) 1px, transparent 1px); }
  .light-mode .settingsHero, .light-mode .settingsSection { box-shadow: 0 16px 36px rgba(41,74,104,.08) !important; }
  @media (max-width: 899px) { .app-shell .bottomNav::before, .app-shell .bottomNav::after { display: none !important; } }
  @media (min-width: 900px) { .app-shell:not(.sidebar-collapsed) .bottomNav::before { display: block !important; } .app-shell .bottomNav::after { display: block !important; } }
  @media (max-width: 700px) {
    .headerWrap { padding: 12px 12px 0 !important; }
    .page { padding: 18px 13px 28px !important; }
    .topWelcome { font-size: 19px !important; }
    .learningHeroBanner { border-radius: 22px !important; }
    .nav-btn:hover { transform: translateY(-2px); }
  }
`;

const styles = {
  countdownBoard: { borderRadius: 18, padding: "12px 14px 14px" },
  countdownBoardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  countdownBoardActions: { display: "flex", gap: 5, alignItems: "center" },
  manageDeadlinesBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    border: `1px solid ${COLORS.teal}55`,
    background: `${COLORS.teal}12`,
    color: COLORS.teal,
    borderRadius: 9,
    padding: "5px 8px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  deadlineGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 8,
    marginTop: 10,
  },
  deadlineCard: {
    background: "rgba(255,255,255,.035)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: "9px 10px",
  },
  noDeadlineHint: {
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 12,
    padding: "12px 10px",
    textAlign: "center",
    color: COLORS.textDim,
    fontSize: 11.5,
    lineHeight: 1.7,
  },
  deadlineCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  deadlineDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  deadlineLabel: {
    fontSize: 11.5,
    fontWeight: 800,
    color: COLORS.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  deadlineDate: {
    marginInlineStart: "auto",
    fontSize: 9.5,
    color: COLORS.textDim,
    whiteSpace: "nowrap",
  },
  deadlineAlert: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(232,196,104,.14)",
    border: "1px solid rgba(232,196,104,.42)",
    borderRadius: 10,
    color: "#E8C468",
    padding: "7px 9px",
    fontSize: 11.5,
    animation: "alertIn .3s ease both",
  },
  alertPulse: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#E8C468",
    boxShadow: "0 0 0 0 rgba(232,196,104,.8)",
    animation: "alertPulse 1.2s infinite",
  },
  deadlineList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 18,
  },
  deadlineManagerRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: COLORS.surface2,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "9px 10px",
  },
  deadlineManagerSmall: {
    display: "block",
    color: COLORS.textDim,
    fontSize: 10,
    marginTop: 3,
  },
  deadlineForm: {
    marginTop: 15,
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 8,
  },
  goalTabs: {
    marginTop: 10,
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    overflow: "hidden",
  },
  goalTabBar: {
    display: "flex",
    gap: 4,
    padding: 5,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  goalTabButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: "8px 5px",
    fontSize: 11.5,
    fontWeight: 800,
    cursor: "pointer",
    transition: "all .18s ease",
  },
  goalTabDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    flexShrink: 0,
    boxShadow: "0 0 6px currentColor",
  },
  goalEditor: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    padding: "10px 11px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 12,
    margin: "10px",
    background: COLORS.surface2,
  },
  goalEditorIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  goalEditorLabel: { fontSize: 11, fontWeight: 800, marginBottom: 4 },
  chartWrap: { position: "relative", padding: "2px 0 0" },
  chartHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  chartEyebrow: { fontSize: 11, color: COLORS.textDim, fontWeight: 700 },
  chartValue: {
    fontFamily: FONT_HEAD,
    fontSize: 23,
    fontWeight: 800,
    color: COLORS.text,
    marginTop: 2,
  },
  chartValueLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    color: COLORS.teal,
    fontWeight: 600,
  },
  chartSummary: { fontSize: 11, color: COLORS.textDim, paddingTop: 16 },
  chartAxis: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 9.5,
    color: COLORS.textDim,
    marginTop: -8,
  },
  dailyPlanBtn: {
    marginTop: 14,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    background: "linear-gradient(135deg, #31E5C0, #8B7CFF)",
    border: "none",
    borderRadius: 11,
    padding: "10px 12px",
    color: "#081311",
    fontWeight: 800,
    fontSize: 12.5,
    cursor: "pointer",
    boxShadow: "0 8px 20px -12px rgba(49,229,192,.9)",
  },
  dailyCards: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  dailyCard: {
    background: COLORS.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: "10px 11px",
    minWidth: 0,
  },
  dailyCardTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 5,
  },
  dailyCardText: {
    fontSize: 11.5,
    color: COLORS.textDim,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  dailyDomainName: { fontSize: 10, fontWeight: 500, opacity: 0.8 },
  dailyPicker: { marginTop: 14, padding: "0 2px" },
  dailyItemsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 14,
    maxHeight: 190,
    overflowY: "auto",
  },
  dailyItemRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: COLORS.surface2,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "9px 10px",
  },
  dailyItemMeta: {
    display: "block",
    color: COLORS.textDim,
    fontSize: 10,
    marginTop: 3,
  },
  modalPanel: { maxHeight: "calc(100vh - 32px)", overflowY: "auto" },
  modalTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  modalEyebrow: {
    color: COLORS.teal,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  modalTitle: {
    margin: "5px 0 5px",
    fontFamily: FONT_HEAD,
    fontSize: 22,
    color: COLORS.text,
  },
  modalHint: {
    margin: 0,
    color: COLORS.textDim,
    fontSize: 12.5,
    lineHeight: 1.7,
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    color: COLORS.textDim,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  reminderCard: {
    width: "min(420px, 100%)",
    textAlign: "center",
    padding: "28px 24px 22px",
  },
  reminderIcon: {
    width: 56,
    height: 56,
    margin: "0 auto 14px",
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: COLORS.gold,
    background: `${COLORS.gold}18`,
    border: `1px solid ${COLORS.gold}44`,
  },
  reminderText: {
    margin: "12px 0 20px",
    color: COLORS.textDim,
    fontSize: 14,
    lineHeight: 1.9,
  },
  planForm: { marginTop: 14 },
  formSectionTitle: {
    fontFamily: FONT_HEAD,
    fontSize: 14,
    fontWeight: 800,
    color: COLORS.text,
    margin: "18px 0 10px",
  },
  planGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  planField: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 11,
    padding: 9,
    background: COLORS.surface2,
  },
  planFieldTitle: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    fontWeight: 800,
    marginBottom: 5,
  },
  reportHero: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background:
      "linear-gradient(135deg, rgba(49,229,192,.14), rgba(139,124,255,.13))",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
  },
  reportPercent: {
    fontFamily: FONT_HEAD,
    fontSize: 36,
    fontWeight: 800,
    color: COLORS.teal,
    textShadow: "0 0 18px rgba(49,229,192,.4)",
  },
  reportRows: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginTop: 12,
  },
  appShell: {
    fontFamily: FONT_BODY,
    background: `radial-gradient(ellipse 120% 60% at 50% -10%, #10201C 0%, ${COLORS.bg} 45%), ${COLORS.bg}`,
    color: COLORS.text,
    height: "min(860px, calc(100vh - 32px))",
    maxWidth: 500,
    width: "100%",
    margin: "0 auto",
    position: "relative",
    borderRadius: 22,
    overflow: "hidden",
    border: `1px solid ${COLORS.border}`,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
  },
  glowBlobTeal: {
    top: -60,
    insetInlineStart: -40,
    width: 200,
    height: 200,
    background: "#2FE6C4",
    opacity: 0.16,
  },
  glowBlobViolet: {
    top: -30,
    insetInlineEnd: -60,
    width: 220,
    height: 220,
    background: "#8B7CFF",
    opacity: 0.14,
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: 400,
    gap: 12,
  },
  spinner: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: `3px solid ${COLORS.border}`,
    borderTopColor: COLORS.gold,
    animation: "spin 0.8s linear infinite",
  },
  screenWrap: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    position: "relative",
    zIndex: 1,
  },
  page: { padding: "20px 18px 8px" },
  saveIndicator: show => ({
    position: "absolute",
    top: 10,
    insetInlineStart: "50%",
    transform: `translateX(50%) translateY(${show ? "0" : "-40px"})`,
    background: COLORS.gold,
    color: "#14181B",
    fontSize: 11.5,
    fontWeight: 700,
    padding: "5px 14px",
    borderRadius: 20,
    opacity: show ? 1 : 0,
    transition: "all .3s ease",
    zIndex: 50,
  }),
  settingsHero: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: `linear-gradient(135deg, ${COLORS.surface}, ${COLORS.surface2})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  settingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: COLORS.teal,
    background: `${COLORS.teal}18`,
  },
  settingsTitle: {
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 20,
    color: COLORS.text,
  },
  settingsSubtitle: { fontSize: 12, color: COLORS.textDim, marginTop: 4 },
  settingsSection: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  settingsSectionTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: COLORS.text,
    marginBottom: 10,
  },
  settingsOptions: { display: "flex", flexDirection: "column", gap: 8 },
  settingsOption: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "start",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: "11px 12px",
    color: COLORS.text,
    cursor: "pointer",
  },
  settingsOptionSpan: {
    display: "block",
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 3,
  },
  settingsNote: {
    color: COLORS.textDim,
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 1.7,
    marginTop: 16,
  },
  tonePicker: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 7,
    marginTop: 9,
  },
  toneButton: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: "8px 5px",
    background: COLORS.surface,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  welcomeCard: {
    background: `linear-gradient(160deg, ${COLORS.surface}, ${COLORS.surface2})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: "18px 20px 16px",
  },
  welcomeTop: { opacity: 0.9 },
  welcomeBottom: {
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 21,
    marginTop: 10,
    color: COLORS.text,
  },
  emptyCard: {
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 14,
    padding: "18px 16px",
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: "center",
    lineHeight: 1.7,
  },
  reviewRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: "10px 12px",
  },
  reviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  reviewTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: COLORS.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  reviewMeta: { fontSize: 11.5, color: COLORS.textDim, marginTop: 2 },
  reviewScheduleList: { display: "flex", flexDirection: "column", gap: 9 },
  reviewScheduleRow: {
    width: "100%",
    textAlign: "start",
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: "11px 12px",
    cursor: "pointer",
  },
  reviewScheduleTitle: { fontSize: 13, fontWeight: 800, marginBottom: 8 },
  reviewScheduleTitleSpan: {
    display: "block",
    fontSize: 10.5,
    color: COLORS.textDim,
    fontWeight: 500,
    marginTop: 3,
  },
  reviewPills: { display: "flex", flexWrap: "wrap", gap: 5 },
  reviewPill: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: "5px 7px",
    fontSize: 10,
    lineHeight: 1.2,
  },
  overdueBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #E0715C66",
    background: "#E0715C12",
    color: "#E0715C",
  },
  overdueBannerText: { display: "flex", flexDirection: "column", gap: 3 },
  overdueDismiss: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #E0715C55",
    borderRadius: 8,
    background: "transparent",
    color: "#E0715C",
    cursor: "pointer",
  },
  reviewFilterBar: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 },
  reviewFilterBtn: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: "6px 10px",
    background: COLORS.surface2,
    color: COLORS.textDim,
    fontSize: 11,
    cursor: "pointer",
  },
  reviewFilterActive: {
    borderColor: `${COLORS.teal}99`,
    background: `${COLORS.teal}18`,
    color: COLORS.teal,
  },
  reviewFilterOverdue: {
    borderColor: "#E0715C99",
    background: "#E0715C18",
    color: "#E0715C",
  },
  doneBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    fontWeight: 700,
    background: "transparent",
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textDim,
    borderRadius: 20,
    padding: "7px 10px",
    cursor: "pointer",
    flexShrink: 0,
  },
  trackGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  trackCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: "16px 14px",
    textAlign: "start",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  trackIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  trackLabel: {
    fontFamily: FONT_HEAD,
    fontWeight: 700,
    fontSize: 14.5,
    color: COLORS.text,
  },
  trackMeta: { fontSize: 11, color: COLORS.textDim },
  trackTabs: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 },
  trackTab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: "7px 13px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  iconRoundBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  formCard: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  fieldLabel: {
    display: "block",
    fontSize: 12,
    color: COLORS.textDim,
    marginBottom: 6,
    marginTop: 10,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    background: COLORS.surface2,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13.5,
    color: COLORS.text,
    marginBottom: 4,
  },
  dashedAddBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 12.5,
    color: COLORS.textDim,
    cursor: "pointer",
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    border: "none",
    borderRadius: 10,
    padding: "11px 0",
    fontWeight: 700,
    fontSize: 13.5,
    background: "#2563EB",
    color: "#FFFFFF",
    cursor: "pointer",
  },
  ghostBtn: {
    border: `1px solid ${COLORS.border}`,
    background: "transparent",
    borderRadius: 10,
    padding: "11px 16px",
    fontSize: 13.5,
    color: COLORS.textDim,
    cursor: "pointer",
  },
  smallGhostBtn: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    background: "transparent",
    borderRadius: 8,
    padding: 7,
    color: COLORS.textDim,
    cursor: "pointer",
    display: "flex",
  },
  domainCard: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 15,
  },
  subtopicRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: COLORS.surface2,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
    width: "100%",
  },
  backRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    color: COLORS.textDim,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 10,
  },
  finishDomainBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: `${COLORS.gold}66`,
    borderRadius: 20,
    padding: "7px 11px",
    background: `${COLORS.gold}12`,
    color: COLORS.gold,
    fontSize: 11.5,
    fontWeight: 800,
    cursor: "pointer",
  },
  finishDomainBtnDone: {
    borderColor: `${COLORS.teal}66`,
    background: `${COLORS.teal}14`,
    color: COLORS.teal,
  },
  lessonStepActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    paddingTop: 24,
    flexWrap: "wrap",
  },
  lessonPageTitle: {
    fontFamily: FONT_HEAD,
    fontSize: 16,
    fontWeight: 800,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  saveStageBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 10,
    padding: "9px 13px",
    marginBottom: 14,
    background: "rgba(56, 211, 192, .08)",
    fontFamily: FONT_HEAD,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  deleteConfirmCard: {
    width: "min(100%, 390px)",
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 24,
    textAlign: "center",
    boxShadow: "0 20px 70px rgba(0,0,0,.45)",
  },
  deleteConfirmIcon: {
    width: 48,
    height: 48,
    margin: "0 auto 12px",
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    color: "#F08080",
    background: "rgba(224,113,92,.14)",
  },
  deleteConfirmBtn: {
    border: 0,
    borderRadius: 10,
    padding: "10px 16px",
    background: "#D95C5C",
    color: "white",
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    cursor: "pointer",
  },
  spiritualTitleCard: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 24,
    marginTop: 18,
    minHeight: 150,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  nextStepBtn: {
    border: 0,
    borderRadius: 12,
    color: "#10201D",
    padding: "11px 25px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(0,0,0,.2)",
  },
  prevStepBtn: {
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    color: COLORS.text,
    background: COLORS.surface,
    padding: "11px 18px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
  },
  stepBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  reverseMediaActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 10,
  },
  reverseFilesList: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
    marginTop: 12,
  },
  reverseFileCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 7,
    padding: 10,
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
  },
  reverseFileName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    paddingInlineEnd: 30,
  },
  reverseFileImage: {
    width: "100%",
    maxHeight: 240,
    objectFit: "contain",
    borderRadius: 9,
    background: COLORS.bg,
  },
  reverseFileVideo: { width: "100%", maxHeight: 260, borderRadius: 9 },
  reverseFileLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "13px 10px",
    borderRadius: 9,
    background: COLORS.surface2,
    color: COLORS.teal,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 700,
  },
  uploadProgressWrap: {
    marginTop: 10,
    padding: "9px 11px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    background: COLORS.surface2,
  },
  uploadProgressTop: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 6,
  },
  uploadProgressTrack: {
    height: 7,
    borderRadius: 99,
    background: COLORS.border,
    overflow: "hidden",
  },
  uploadProgressFill: {
    height: "100%",
    borderRadius: 99,
    background: COLORS.teal,
    transition: "width .15s ease",
  },
  fourWordsImage: {
    width: "100%",
    maxHeight: 220,
    objectFit: "cover",
    borderRadius: 12,
    marginTop: 10,
    border: `1px solid ${COLORS.border}`,
  },
  tabStrip: {
    display: "flex",
    gap: 4,
    overflowX: "auto",
    borderBottom: `1px solid ${COLORS.border}`,
    marginTop: 18,
  },
  tabBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    borderBottom: "2px solid",
    padding: "10px 10px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  tabHint: {
    fontSize: 12.5,
    color: COLORS.textDim,
    lineHeight: 1.7,
    marginBottom: 12,
  },
  explanationHero: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: COLORS.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 13,
  },
  explanationIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  explanationTitle: {
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 15,
    marginBottom: 4,
  },
  webSearchGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 14,
  },
  webSearchBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 11,
    padding: "11px 8px",
    color: COLORS.teal,
    background: COLORS.surface2,
    fontSize: 12,
    fontWeight: 800,
    textDecoration: "none",
  },
  savedLink: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: COLORS.teal,
    fontSize: 12,
    textDecoration: "none",
    margin: "5px 0 12px",
  },
  explanationHint: { color: COLORS.textDim, fontSize: 11.5, marginTop: 5 },
  fourWordsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 14,
  },
  fourWordCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: COLORS.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: "11px 10px",
  },
  fourWordNumber: {
    width: 25,
    height: 25,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: COLORS.surface2,
    fontWeight: 800,
    fontSize: 12,
    flexShrink: 0,
  },
  mindmapBox: {
    backgroundColor: "#FFFDF6",
    border: "2px solid #D8CBB4",
    borderRadius: 18,
    padding: "34px 30px 42px",
    minHeight: 270,
    overflowX: "auto",
    boxShadow: "inset 0 0 0 5px #FFFDF688, 3px 4px 0 #C9BBA4",
  },
  treeNodeWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "max-content",
    fontFamily: '"Kalam", "Patrick Hand", "Comic Sans MS", cursive',
    gap: 2,
  },
  treeChildren: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 34,
    marginTop: 34,
    paddingTop: 0,
    paddingInline: 18,
    borderTop: "0",
  },
  treeChild: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: 176,
    paddingInline: 5,
  },
  treeChildConnector: {
    display: "none",
  },
  treeActionBtn: {
    border: "2px solid #A9977A",
    background: "#FFF8D9",
    borderRadius: "9px 7px 10px 6px",
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#75644D",
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: "1px 2px 0 #C9BBA4",
  },
  mindNodeBubble: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#A9977A",
    borderRadius: "13px 10px 15px 9px",
    padding: "11px 15px",
    minWidth: 108,
    background: "#FFF8D9",
    boxShadow: "2px 3px 0 #B7A98D",
  },
  mindNodeInput: {
    background: "none",
    border: "none",
    color: "#3F392F",
    fontSize: 16,
    width: "100%",
    padding: 0,
    minHeight: 28,
    lineHeight: 1.65,
    resize: "none",
    overflow: "hidden",
    boxSizing: "border-box",
    fontFamily: '"Kalam", "Patrick Hand", "Comic Sans MS", cursive',
  },
  miniIconBtn: {
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    borderRadius: 7,
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: COLORS.textDim,
    cursor: "pointer",
    flexShrink: 0,
  },
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 14,
  },
  imageCard: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 8,
  },
  imageThumb: {
    width: "100%",
    height: 100,
    objectFit: "cover",
    borderRadius: 8,
    display: "block",
  },
  imageRemoveBtn: {
    position: "absolute",
    top: 5,
    insetInlineEnd: 5,
    background: "#0F1417cc",
    border: "none",
    borderRadius: 6,
    width: 22,
    height: 22,
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  captionInput: {
    width: "100%",
    background: "none",
    border: "none",
    borderTop: `1px solid ${COLORS.border}`,
    marginTop: 6,
    paddingTop: 6,
    fontSize: 11.5,
    color: COLORS.textDim,
  },
  videoEmbedWrap: {
    marginTop: 10,
    borderRadius: 12,
    overflow: "hidden",
    border: `1px solid ${COLORS.border}`,
  },
  videoEmbed: {
    width: "100%",
    aspectRatio: "16/9",
    border: "none",
    display: "block",
  },
  fileRow: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "9px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bottomNav: {
    flexShrink: 0,
    height: 62,
    background: COLORS.surface,
    borderTop: `1px solid ${COLORS.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    position: "relative",
    zIndex: 1,
  },
  headerWrap: {
    flexShrink: 0,
    position: "relative",
    zIndex: 2,
    padding: "12px 14px 0",
  },
  globalBackButton: {
    position: "absolute",
    insetInlineStart: 14,
    top: 14,
    width: 38,
    height: 38,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    color: COLORS.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 4,
  },
  sidebarToggle: {
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    color: COLORS.text,
    borderRadius: 11,
    width: 42,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    cursor: "pointer",
    margin: "0 auto 4px",
  },
  topWelcome: {
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 22,
    color: COLORS.text,
    textAlign: "center",
    padding: "4px 0 12px",
  },
  countdownGlass: { borderRadius: 18, padding: "12px 14px 14px" },
  countdownTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countdownEyebrow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: 600,
  },
  livePill: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10,
    color: "#31E5C0",
    fontWeight: 700,
    background: "#31E5C01a",
    border: "1px solid #31E5C040",
    borderRadius: 20,
    padding: "3px 9px",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#31E5C0",
    display: "inline-block",
    boxShadow: "0 0 8px #31E5C0",
  },
  countdownEnded: {
    textAlign: "center",
    padding: "14px 0 4px",
    fontFamily: FONT_HEAD,
    fontWeight: 700,
    fontSize: 15,
    color: COLORS.text,
  },
  countdownRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    direction: "ltr",
  },
  digitCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
  },
  digitBox: {
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 22,
    minWidth: 48,
    textAlign: "center",
    padding: "8px 4px",
    borderRadius: 12,
    color: "#EAFBF6",
    textShadow: "0 0 16px rgba(47,230,196,0.55)",
    letterSpacing: 0.5,
    fontVariantNumeric: "tabular-nums",
  },
  digitLabel: { fontSize: 10, color: COLORS.textDim, fontWeight: 600 },
  colon: {
    fontFamily: FONT_HEAD,
    fontWeight: 800,
    fontSize: 20,
    color: "#8B7CFF",
    marginTop: -16,
    textShadow: "0 0 10px rgba(139,124,255,0.6)",
  },
  statusBar: {
    display: "flex",
    marginTop: 12,
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    overflow: "hidden",
  },
  statusCell: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 12px",
    minWidth: 0,
  },
  statusDivider: {
    width: 1,
    alignSelf: "stretch",
    background:
      "linear-gradient(to bottom, transparent, rgba(255,255,255,0.14), transparent)",
  },
  statusIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusLabel: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  statusInput: {
    width: "100%",
    background: "none",
    border: "none",
    color: COLORS.text,
    fontSize: 12,
    padding: 0,
    fontFamily: FONT_BODY,
  },
  navBtn: active => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    background: "none",
    border: "none",
    color: active ? COLORS.teal : COLORS.textDim,
    cursor: "pointer",
    padding: "8px 22px",
  }),
};
