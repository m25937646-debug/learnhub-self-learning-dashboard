import { richTextToPlainText } from "@/components/RichTextEditor";

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
