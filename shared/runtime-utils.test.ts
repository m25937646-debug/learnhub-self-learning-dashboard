import { describe, expect, it } from "vitest";
import {
  activeBattleItems,
  annualItemProgress,
  createQuarterlyPlanItem,
  createQuarterlyPlanItems,
  dailyBattleItems,
  isPlanItemComplete,
  quarterlySelectionsForAnnualItem,
  removeAnnualDomainTree,
  selectPlanItemsByIds,
  sortPlanItemsByTrack,
  weeklyTaskProgress,
} from "./plan-utils";
import {
  formatStudyTime,
  totalStudiedSecondsForDomain,
} from "./study-timer";
import {
  formatLocalCalendarDate,
  getCalendarWeekStart,
  getWeekTaskDate,
} from "./calendar-utils";
import { pickNewestSnapshot, shouldAcceptRevision } from "./durable-save";

describe("imported dashboard runtime utilities", () => {
  it("calculates linked plan progress and creates quarterly children", () => {
    const annual = { id: "a1", track: "academic", domain: "البرمجة", hours: 10, progress: 0 };
    const quarterly = createQuarterlyPlanItem(annual, "q1", 3, "q1-1");
    const monthly = { id: "m1", sourceQuarterlyId: quarterly.id, domain: annual.domain, progress: 100 };

    expect(quarterly.parentAnnualId).toBe("a1");
    expect(annualItemProgress(annual, [quarterly], [monthly], [])).toBe(100);
  });

  it("uses linked weekly completion when calculating item progress", () => {
    expect(weeklyTaskProgress({ id: "m1", domain: "قراءة", progress: 0 }, [
      { domain: "قراءة", completed: true },
    ])).toBe(100);
  });

  it("removes an annual branch and its related tasks", () => {
    const result = removeAnnualDomainTree(
      {
        annual: [{ id: "a1", domain: "رياضيات", track: "academic" }],
        quarterly: [{ id: "q1", parentAnnualId: "a1", domain: "رياضيات", track: "academic" }],
      },
      [{ id: "t1", domain: "رياضيات" }, { id: "t2", domain: "لغة" }],
      "a1",
    );
    expect(result.planItems.annual).toHaveLength(0);
    expect(result.planItems.quarterly).toHaveLength(0);
    expect(result.weekTasks.map(task => task.id)).toEqual(["t2"]);
  });

  it("reports every quarter where an annual domain was selected", () => {
    const annual = { id: "a1", domain: "رياضيات", track: "academic" };
    const quarters = [
      { key: "q1", label: "الربع الأول" },
      { key: "q2", label: "الربع الثاني" },
      { key: "q3", label: "الربع الثالث" },
    ];
    const selected = quarterlySelectionsForAnnualItem(
      annual,
      [
        { id: "q1-item", parentAnnualId: "a1", quarter: "q1" },
        { id: "q3-item", domain: "رياضيات", track: "academic", quarter: "q3" },
      ],
      quarters,
    );
    expect(selected.map(quarter => quarter.key)).toEqual(["q1", "q3"]);
  });

  it("keeps completed titles out of the active daily battle", () => {
    expect(activeBattleItems([
      { id: "open", progress: 40 },
      { id: "done", progress: 100 },
      { id: "also-done", completed: true, progress: 100 },
    ]).map(item => item.id)).toEqual(["open"]);
  });

  it("keeps review entries out of the daily battle feed", () => {
    expect(dailyBattleItems([
      { id: "lesson", date: "2026-09-27" },
      { id: "review", isReview: true, date: "2026-09-27" },
      { id: "review-stage", reviewIndex: 1, date: "2026-09-27" },
    ], "2026-09-27").map(item => item.id)).toEqual(["lesson"]);
  });

  it("marks a task complete only at 100 percent or with an explicit completed flag", () => {
    expect(isPlanItemComplete({ progress: 99 })).toBe(false);
    expect(isPlanItemComplete({ progress: 100 })).toBe(true);
    expect(isPlanItemComplete({ completed: true, progress: 0 })).toBe(true);
  });

  it("orders annual domains by the configured track sequence", () => {
    const ordered = sortPlanItemsByTrack(
      [
        { id: "personal", track: "personal" },
        { id: "professional", track: "professional" },
        { id: "academic", track: "academic" },
      ],
      ["professional", "personal", "academic"],
    );
    expect(ordered.map(item => item.id)).toEqual(["professional", "personal", "academic"]);
  });

  it("selects several plan domains in one batch without changing list order", () => {
    const selected = selectPlanItemsByIds(
      [
        { id: "first", domain: "الأول" },
        { id: "second", domain: "الثاني" },
        { id: "third", domain: "الثالث" },
      ],
      ["third", "first"],
    );
    expect(selected.map(item => item.id)).toEqual(["first", "third"]);
  });

  it("creates one quarterly item per selected annual domain", () => {
    const items = createQuarterlyPlanItems(
      [
        { id: "a1", track: "academic", domain: "برمجة", hours: 10 },
        { id: "a2", track: "personal", domain: "قراءة", hours: 6 },
      ],
      "q2",
      parent => Number(parent.hours),
      "quarterly-batch",
    );
    expect(items.map(item => item.parentAnnualId)).toEqual(["a1", "a2"]);
    expect(items.map(item => item.id)).toEqual(["quarterly-batch-0", "quarterly-batch-1"]);
  });

  it("formats study time and aggregates sessions by domain", () => {
    expect(formatStudyTime(125)).toEqual({ minutes: 2, seconds: 5 });
    expect(totalStudiedSecondsForDomain([
      { domainId: "d1", durationSeconds: 60 },
      { domainId: "d2", durationSeconds: 90 },
    ], "d1")).toBe(60);
  });

  it("keeps calendar dates in local YYYY-MM-DD form and resolves week tasks", () => {
    const start = getCalendarWeekStart(new Date(2026, 8, 27, 12));
    expect(formatLocalCalendarDate(start)).toBe("2026-09-24");
    expect(getWeekTaskDate({ month: "m9", week: 1, day: "thu", year: 2026 })).toBe("2026-08-27");
  });

  it("restores the newest usable local snapshot", () => {
    const newest = pickNewestSnapshot(
      [
        { meta: { localRevision: 12 }, domains: [{ id: "old" }] },
        { meta: { localRevision: 18 }, domains: [{ id: "new" }] },
      ],
      snapshot => Array.isArray(snapshot.domains) && snapshot.domains.length > 0,
    );
    expect(newest?.domains?.[0]?.id).toBe("new");
  });

  it("rejects an older incoming revision", () => {
    expect(shouldAcceptRevision(20, 19)).toBe(false);
    expect(shouldAcceptRevision(20, 20)).toBe(true);
    expect(shouldAcceptRevision(20, 21)).toBe(true);
  });
});
