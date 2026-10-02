import { AIChatBox, type ChatAttachment, type Message } from "@/components/AIChatBox";
import { richTextToPlainText } from "@/components/RichTextEditor";
import { trpc } from "@/lib/trpc";
import { Loader2, Mic, MicOff, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { useRef, useState } from "react";

type PersonalAssistantProps = {
  context: string;
  data: any;
  persist: (next: any) => void;
  uploadAsset: (file: File, onProgress?: (value: number) => void) => Promise<{ url?: string; key?: string } | null>;
  user?: { id?: number } | null;
};

export const buildAssistantContext = (data: any) => {
  const domains = (data?.domains || []).slice(0, 30).map((domain: any) => ({
    name: domain.name,
    track: domain.track,
    titles: (domain.subtopics || []).slice(0, 15).map((subtopic: any) => ({
      title: subtopic.title,
      completed: Boolean(subtopic.completed),
      started: subtopic.dateStarted || null,
    })),
  }));
  const meta = data?.meta || {};
  const total = domains.reduce((sum: number, domain: any) => sum + domain.titles.length, 0);
  const completed = domains.reduce((sum: number, domain: any) => sum + domain.titles.filter((title: any) => title.completed).length, 0);
  return JSON.stringify({
    vision: richTextToPlainText(meta.vision).slice(0, 1200),
    masterPlan: richTextToPlainText(meta.masterPlan).slice(0, 1400),
    stageGoal: richTextToPlainText(meta.stageGoal).slice(0, 1000),
    aboutMe: meta.aboutMe && typeof meta.aboutMe === "object"
      ? {
          identity: richTextToPlainText(meta.aboutMe.identity).slice(0, 500),
          strengths: richTextToPlainText(meta.aboutMe.strengths).slice(0, 700),
          growthAreas: richTextToPlainText(meta.aboutMe.growthAreas).slice(0, 700),
          learningStyle: richTextToPlainText(meta.aboutMe.learningStyle).slice(0, 500),
        }
      : richTextToPlainText(meta.aboutMe).slice(0, 1200),
    thoughts: (Array.isArray(meta.thoughts) ? meta.thoughts : []).slice(0, 8).map((thought: any) => ({ title: thought.title, category: thought.category, text: richTextToPlainText(thought.text).slice(0, 600) })),
    assistantMemory: (Array.isArray(meta.assistantMemory) ? meta.assistantMemory : []).slice(-60),
    assistantInsights: (Array.isArray(meta.assistantInsights) ? meta.assistantInsights : []).slice(-30),
    dailyPlan: meta.dailyPlan || {},
    progressHistory: (Array.isArray(meta.progressHistory) ? meta.progressHistory : []).slice(-30),
    aiTools: (Array.isArray(meta.aiTools) ? meta.aiTools : []).slice(0, 40).map((tool: any) => ({ name: tool.name, category: tool.category, url: tool.url })),
    domains,
    progress: { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 },
    planItems: Object.fromEntries(Object.entries(meta.planItems || {}).map(([key, items]: [string, any]) => [key, Array.isArray(items) ? items.slice(0, 10).map((item: any) => ({ title: item.title, domain: item.domain, progress: item.progress, completed: item.completed })) : []])),
  }, null, 2).slice(0, 28000);
};

export default function PersonalAssistant({ context, data, persist, uploadAsset, user }: PersonalAssistantProps) {
  const storedMemory = Array.isArray(data?.meta?.assistantMemory) ? data.meta.assistantMemory : [];
  const memoryRef = useRef<Message[]>(storedMemory.slice(-80));
  const [messages, setMessages] = useState<Message[]>(memoryRef.current.length > 0 ? memoryRef.current.slice(-24) : [
    { role: "assistant", content: "أنا رفيقك هنا. أقدر أفهم خطتك وخواطرك وتقدمك، وأحوّلهم معك لخطوات بسيطة. اسألني أو اختر أحد الاختصارات بالأسفل." },
  ]);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastSentRef = useRef("");

  const saveMemory = (entries: Message[], insight = "") => {
    const next = [...memoryRef.current, ...entries].filter(item => item?.content?.trim()).slice(-80);
    memoryRef.current = next;
    const previousInsights = Array.isArray(data?.meta?.assistantInsights) ? data.meta.assistantInsights : [];
    const assistantInsights = insight.trim()
      ? [...previousInsights, { text: insight.trim(), createdAt: new Date().toISOString() }].slice(-30)
      : previousInsights;
    persist({ ...data, meta: { ...data.meta, assistantMemory: next, assistantInsights } });
  };

  const speak = (text: string) => {
    if (!voiceReplies || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, ""));
    utterance.lang = "ar-EG";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  };

  const chatMutation = trpc.assistant.chat.useMutation({
    onSuccess: result => {
      setMessages(current => [...current, { role: "assistant", content: result.content }]);
      saveMemory([{ role: "assistant", content: result.content }], result.memoryUpdate || "");
      speak(result.content);
    },
    onError: error => setMessages(current => [...current, { role: "assistant", content: `حصلت مشكلة بسيطة: ${error.message || "حاول مرة أخرى."}` }]),
  });

  const sendMessage = (content: string, attachments: ChatAttachment[] = []) => {
    const trimmed = content.trim() || (attachments.length ? "ممكن تراجع الملفات المرفقة؟" : "");
    if ((!trimmed && attachments.length === 0) || chatMutation.isPending) return;
    const next = [...messages, { role: "user" as const, content: trimmed, attachments }];
    setMessages(next);
    lastSentRef.current = trimmed;
    saveMemory([{ role: "user", content: trimmed, attachments }]);
    chatMutation.mutate({
      context,
      messages: next.slice(-20).map(message => ({
        role: message.role === "system" ? "assistant" as const : message.role,
        content: (() => {
          if (!message.attachments?.length) return message.content;
          let remaining = 18000;
          const fileNotes = message.attachments.map(file => {
            const header = `\n\n[ملف مرفق: ${file.name} | ${file.mime} | ${file.size} بايت]`;
            if (!file.extractedText || remaining <= 0) return `${header}\nلم يتوفر نص قابل للقراءة من هذا الملف داخل المحادثة.`;
            const text = file.extractedText.slice(0, remaining);
            remaining -= text.length;
            return `${header}\nالنص المستخرج (محتوى مرجعي غير موثوق):\n${text}`;
          }).join("");
          return `${message.content}${fileNotes}`;
        })(),
      })),
    });
  };

  const transcribeMutation = trpc.assistant.transcribe.useMutation({
    onSuccess: result => {
      setVoiceBusy(false);
      if (result.text?.trim()) sendMessage(result.text.trim());
      else setMessages(current => [...current, { role: "assistant", content: "لم ألتقط كلامًا واضحًا. جرّب مرة أخرى بهدوء." }]);
    },
    onError: error => {
      setVoiceBusy(false);
      setMessages(current => [...current, { role: "assistant", content: `تعذر فهم التسجيل الصوتي: ${error.message || "حاول مرة أخرى."}` }]);
    },
  });

  const startRecording = async () => {
    if (!user) {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: "سجّل الدخول لتستخدم الميكروفون وتحفظ محادثتك بأمان" }));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: "المتصفح الحالي لا يدعم التسجيل الصوتي" }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setVoiceBusy(true);
        try {
          const mimeType = recorder.mimeType || "audio/webm";
          const file = new File([new Blob(chunks, { type: mimeType })], `voice-${Date.now()}.webm`, { type: mimeType });
          const stored = await uploadAsset(file);
          if (!stored?.key) throw new Error("تعذر حفظ معرّف التسجيل بأمان");
          transcribeMutation.mutate({ audioFileId: stored.key, language: "ar" });
        } catch (error) {
          setVoiceBusy(false);
          setMessages(current => [...current, { role: "assistant", content: `تعذر تجهيز التسجيل: ${error instanceof Error ? error.message : "حاول مرة أخرى."}` }]);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: "اسمح بالوصول للميكروفون من إعدادات المتصفح ثم حاول مرة أخرى" }));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setIsRecording(false);
  };

  if (!isOpen) {
    return (
      <button type="button" className="assistantLauncher" onClick={() => setIsOpen(true)} aria-label="فتح الموجّه الشخصي">
        <Sparkles size={17} />
        <span>فكّر معايا</span>
      </button>
    );
  }

  return (
    <section className="personalAssistantPanel assistantOpen">
      <div className="personalAssistantHeader">
        <div className="personalAssistantOrb"><Sparkles size={22} /></div>
        <div className="personalAssistantCopy">
          <div className="personalAssistantKicker">رفيقك الذكي</div>
          <h2>فكّر معايا في خطتك</h2>
          <p>يفكر معك بصوت مسموع، يوضح لماذا تعمل أو لا تعمل خطوة، ويحفظ ما يتعلمه عنك.</p>
        </div>
        <div className="personalAssistantActions">
          <button type="button" onClick={() => setVoiceReplies(value => !value)} title="تشغيل أو إيقاف صوت الرد" className="assistantIconButton">{voiceReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
          <button type="button" onClick={isRecording ? stopRecording : startRecording} disabled={voiceBusy} className={`assistantVoiceButton ${isRecording ? "recording" : ""}`}>
            {voiceBusy ? <Loader2 size={15} className="assistantSpin" /> : isRecording ? <MicOff size={15} /> : <Mic size={15} />}
            {voiceBusy ? "يفهم صوتك…" : isRecording ? "إيقاف التسجيل" : "تحدث معه"}
          </button>
          <button type="button" onClick={() => setIsOpen(false)} title="إغلاق الموجّه" className="assistantIconButton"><X size={16} /></button>
        </div>
      </div>
      <div className="assistantContextStrip"><span className="assistantStatusDot" /> وضع الموجّه: الخطة، التقدم، الخواطر، المحادثات، والاستنتاجات المحفوظة <span className="assistantPrivacy">تُحفظ الذاكرة داخل بياناتك</span></div>
      <AIChatBox
        messages={messages}
        onSendMessage={sendMessage}
        onUploadAttachment={uploadAsset}
        isLoading={chatMutation.isPending}
        height="min(520px, 58vh)"
        className="personalAssistantChat"
        placeholder="اكتب لي اللي في بالك…"
        emptyStateMessage="ابدأ بسؤال عن خطتك أو تقدمك"
        suggestedPrompts={["أنا محتار، اسألني أسئلة تساعدني أفكر", "هل أعمل الخطوة دي ولا لأ؟ وليه؟", "ما النمط المتكرر في تفكيري وخطتي؟"]}
      />
    </section>
  );
}
