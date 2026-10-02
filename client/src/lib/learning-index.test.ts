import { describe, expect, it } from "vitest";
import { buildLearningSearchIndex, getLearningInsights, getLearningNotifications, moveItem, searchLearningIndex } from "./learning-index";

const sample = {
  domains: [{ id: "d1", name: "البرمجة", track: "professional", subtopics: [{ id: "s1", title: "أساسيات TypeScript", completed: true, dateStarted: new Date().toISOString().slice(0, 10), reviewDone: [false, false, true, true], tabs: { attachments: [{ id: "f1", name: "notes.pdf", mime: "application/pdf", caption: "ملخص" }] } }] }],
  meta: {
    weekTasks: [{ id: "t1", title: "مراجعة TypeScript", plannedDate: new Date().toISOString().slice(0, 10), completed: false }],
    thoughts: [{ id: "th1", title: "فكرة مشروع", category: "برمجة", text: "ابنِ أداة صغيرة", tags: ["مهم", "MVP"], sourceUrl: "https://example.com/idea" }],
    focusSessions: [{ id: "focus-1", minutes: 25, endedAt: new Date().toISOString() }],
    planItems: { weekly: [{ id: "p1", title: "تطبيق عملي", domain: "البرمجة" }] },
    progressHistory: [{ date: new Date().toISOString().slice(0, 10) }],
  },
};

describe("learning index", () => {
  it("indexes titles, thoughts and attachments and searches Arabic text", () => {
    const index = buildLearningSearchIndex(sample);
    expect(index.some(item => item.kind === "attachment" && item.title === "notes.pdf")).toBe(true);
    expect(searchLearningIndex(index, "TypeScript")[0]?.kind).toBe("title");
    expect(searchLearningIndex(index, "فكرة مشروع")[0]?.kind).toBe("thought");
    expect(searchLearningIndex(index, "MVP")[0]?.id).toBe("thought:th1");
    expect(searchLearningIndex(index, "example.com")[0]?.id).toBe("thought:th1");
  });

  it("derives progress, focus and actionable notifications", () => {
    const insights = getLearningInsights(sample);
    expect(insights.percent).toBe(100);
    expect(insights.focusMinutes).toBe(25);
    expect(getLearningNotifications(sample).some(item => item.id === "task:t1")).toBe(true);
  });

  it("moves plan items without mutating the original array", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveItem(items, "c", "a").map(item => item.id)).toEqual(["c", "a", "b"]);
    expect(items.map(item => item.id)).toEqual(["a", "b", "c"]);
  });
});
