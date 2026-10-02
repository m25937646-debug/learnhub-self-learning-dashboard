export type LearningSearchItem = {
  id: string;
  kind: "domain" | "title" | "task" | "plan" | "thought" | "attachment";
  title: string;
  subtitle: string;
  searchable: string;
  track?: string;
  domainId?: string;
  subtopicId?: string;
  screen?: string;
  planKey?: string;
};

const text = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const todayKey = () => new Date().toISOString().slice(0, 10);
const dateKey = (value: unknown) => String(value ?? "").slice(0, 10);
const parseDate = (value: unknown) => {
  const key = dateKey(value);
  const date = key ? new Date(`${key}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const addDays = (value: unknown, days: number) => {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const buildLearningSearchIndex = (data: any): LearningSearchItem[] => {
  if (!data) return [];
  const items: LearningSearchItem[] = [];
  for (const domain of Array.isArray(data.domains) ? data.domains : []) {
    const domainTitle = text(domain.name) || "مجال بدون اسم";
    items.push({
      id: `domain:${domain.id}`,
      kind: "domain",
      title: domainTitle,
      subtitle: `مجال · ${text(domain.track)}`,
      searchable: `${domainTitle} ${text(domain.description)} ${text(domain.track)}`,
      track: domain.track,
      domainId: domain.id,
      screen: "domains",
    });
    for (const subtopic of Array.isArray(domain.subtopics) ? domain.subtopics : []) {
      const title = text(subtopic.title) || "عنوان بدون اسم";
      const body = [subtopic.tabs?.summary, subtopic.tabs?.explanation?.notes, subtopic.tabs?.project?.description].map(text).join(" ");
      items.push({
        id: `title:${domain.id}:${subtopic.id}`,
        kind: "title",
        title,
        subtitle: `${domainTitle} · عنوان دراسي`,
        searchable: `${title} ${domainTitle} ${body}`,
        track: domain.track,
        domainId: domain.id,
        subtopicId: subtopic.id,
        screen: "lesson",
      });
      for (const [tabKey, tabValue] of Object.entries(subtopic.tabs || {})) {
        const files = Array.isArray((tabValue as any)?.files) ? (tabValue as any).files : [];
        const attachments = tabKey === "attachments" && Array.isArray(tabValue) ? tabValue : files;
        for (const file of attachments) {
          const name = text((file as any)?.name);
          if (!name) continue;
          items.push({
            id: `attachment:${domain.id}:${subtopic.id}:${(file as any).id || name}`,
            kind: "attachment",
            title: name,
            subtitle: `${title} · مرفق ${text((file as any)?.mime)}`,
            searchable: `${name} ${title} ${domainTitle} ${text((file as any)?.caption)} ${text((file as any)?.mime)}`,
            track: domain.track,
            domainId: domain.id,
            subtopicId: subtopic.id,
            screen: "lesson",
          });
        }
      }
    }
  }
  for (const task of Array.isArray(data.meta?.weekTasks) ? data.meta.weekTasks : []) {
    const title = text(task.title) || "مهمة أسبوعية";
    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title,
      subtitle: `مهمة أسبوعية · ${dateKey(task.plannedDate || task.date) || "بدون موعد"}`,
      searchable: `${title} ${text(task.domain)} ${text(task.track)} ${dateKey(task.plannedDate || task.date)}`,
      track: task.track,
      domainId: task.domainId,
      subtopicId: task.subtopicId,
      screen: task.subtopicId ? "lesson" : "planWorkspace",
      planKey: "weekly",
    });
  }
  for (const level of ["annual", "quarterly", "monthly", "weekly", "daily"]) {
    for (const item of Array.isArray(data.meta?.planItems?.[level]) ? data.meta.planItems[level] : []) {
      const title = text(item.title) || "مهمة خطة";
      items.push({
        id: `plan:${level}:${item.id}`,
        kind: "plan",
        title,
        subtitle: `${level === "weekly" ? "خطة أسبوعية" : level === "monthly" ? "خطة شهرية" : "خطة"} · ${text(item.domain)}`,
        searchable: `${title} ${text(item.domain)} ${text(item.track)}`,
        track: item.track,
        screen: "planPage",
        planKey: level,
      });
    }
  }
  for (const thought of Array.isArray(data.meta?.thoughts) ? data.meta.thoughts : []) {
    const title = text(thought.title) || "خاطرة بدون عنوان";
    const tags = Array.isArray(thought.tags) ? thought.tags.map(text).filter(Boolean).join(" ") : text(thought.tags);
    const sourceUrl = text(thought.sourceUrl);
    items.push({
      id: `thought:${thought.id}`,
      kind: "thought",
      title,
      subtitle: `خاطرة · ${text(thought.category) || "بدون تصنيف"}${tags ? ` · ${tags}` : ""}`,
      searchable: `${title} ${text(thought.category)} ${text(thought.text)} ${tags} ${sourceUrl}`,
      screen: "thoughts",
    });
  }
  return items;
};

export const searchLearningIndex = (index: LearningSearchItem[], query: string, limit = 24) => {
  const normalized = text(query).toLocaleLowerCase("ar");
  if (!normalized) return index.slice(0, limit);
  const words = normalized.split(/\s+/).filter(Boolean);
  return index
    .map(item => {
      const haystack = item.searchable.toLocaleLowerCase("ar");
      const score = words.reduce((total, word) => total + (haystack.includes(word) ? (item.title.toLocaleLowerCase("ar").includes(word) ? 4 : 1) : 0), 0);
      return { item, score };
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, "ar"))
    .slice(0, limit)
    .map(entry => entry.item);
};

export const getLearningInsights = (data: any) => {
  const domains = Array.isArray(data?.domains) ? data.domains : [];
  const titles = domains.flatMap((domain: any) => Array.isArray(domain.subtopics) ? domain.subtopics : []);
  const completedTitles = titles.filter((title: any) => Boolean(title.completed || title.progress >= 100)).length;
  const totalTitles = titles.length;
  const weekTasks = Array.isArray(data?.meta?.weekTasks) ? data.meta.weekTasks : [];
  const today = todayKey();
  const dueTasks = weekTasks.filter((task: any) => dateKey(task.plannedDate || task.date) === today && !task.completed);
  const overdueTasks = weekTasks.filter((task: any) => dateKey(task.plannedDate || task.date) < today && !task.completed);
  const focusSessions = Array.isArray(data?.meta?.focusSessions) ? data.meta.focusSessions : [];
  const focusMinutes = focusSessions.reduce((sum: number, session: any) => sum + Math.max(0, Number(session.minutes) || 0), 0);
  const history = Array.isArray(data?.meta?.progressHistory) ? data.meta.progressHistory : [];
  const historyDays = new Set(history.map((entry: any) => dateKey(entry.date)).filter(Boolean));
  let streak = 0;
  let cursor = new Date(`${today}T12:00:00`);
  while (historyDays.has(cursor.toISOString().slice(0, 10)) || (streak === 0 && focusSessions.some((session: any) => dateKey(session.endedAt || session.startedAt) === today))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    if (streak > 365) break;
  }
  return {
    totalTitles,
    completedTitles,
    percent: totalTitles ? Math.round((completedTitles / totalTitles) * 100) : 0,
    domainsCount: domains.length,
    dueTasks: dueTasks.length,
    overdueTasks: overdueTasks.length,
    focusMinutes,
    focusSessions: focusSessions.length,
    streak,
  };
};

export const getLearningNotifications = (data: any) => {
  const notifications: Array<{ id: string; title: string; body: string; tone: "gold" | "danger" | "teal"; target?: LearningSearchItem }> = [];
  const today = todayKey();
  for (const task of Array.isArray(data?.meta?.weekTasks) ? data.meta.weekTasks : []) {
    if (task.completed) continue;
    const due = dateKey(task.plannedDate || task.date);
    if (!due || due > today) continue;
    notifications.push({
      id: `task:${task.id}`,
      title: due < today ? "مهمة متأخرة" : "مهمة اليوم",
      body: text(task.title) || "لديك مهمة تحتاج انتباهك",
      tone: due < today ? "danger" : "gold",
      target: {
        id: `task:${task.id}`,
        kind: "task",
        title: text(task.title) || "مهمة أسبوعية",
        subtitle: "مهمة أسبوعية",
        searchable: text(task.title),
        track: task.track,
        domainId: task.domainId,
        subtopicId: task.subtopicId,
        screen: task.subtopicId ? "lesson" : "planWorkspace",
        planKey: "weekly",
      },
    });
  }
  for (const domain of Array.isArray(data?.domains) ? data.domains : []) {
    for (const sub of Array.isArray(domain.subtopics) ? domain.subtopics : []) {
      if (!(sub.completed || sub.progress >= 100)) continue;
      const start = dateKey(sub.dateStarted || today);
      const reviewDone = Array.isArray(sub.reviewDone) ? sub.reviewDone : [];
      [1, 3, 7, 20].forEach((days, index) => {
        if (reviewDone[index]) return;
        const due = addDays(start, days);
        if (due <= today) notifications.push({
          id: `review:${domain.id}:${sub.id}:${index}`,
          title: due < today ? "مراجعة متأخرة" : "مراجعة مستحقة",
          body: `${text(sub.title) || "عنوان دراسي"} · مرحلة ${index + 1}`,
          tone: due < today ? "danger" : "teal",
          target: {
            id: `title:${domain.id}:${sub.id}`,
            kind: "title",
            title: text(sub.title) || "عنوان دراسي",
            subtitle: `${text(domain.name)} · مراجعة`,
            searchable: `${text(sub.title)} ${text(domain.name)}`,
            track: domain.track,
            domainId: domain.id,
            subtopicId: sub.id,
            screen: "lesson",
          },
        });
      });
    }
  }
  return notifications.slice(0, 18);
};

export const moveItem = (items: any[], sourceId: string, targetId: string) => {
  const sourceIndex = items.findIndex(item => item.id === sourceId);
  const targetIndex = items.findIndex(item => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const next = items.slice();
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};
