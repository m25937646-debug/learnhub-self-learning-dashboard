type PlanItem = Record<string, any>;
type WeekTask = Record<string, any>;

const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
const sameDomain = (left: PlanItem, right: PlanItem) =>
  normalized(left.domain) === normalized(right.domain) &&
  (!left.track || !right.track || left.track === right.track);
const progressValue = (value: unknown) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
const average = (values: number[], fallback = 0) =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : fallback;

export function isPlanItemComplete(item: PlanItem = {}) {
  return Boolean(item.completed) || progressValue(item.progress) >= 100;
}

const linkedTo = (child: PlanItem, parent: PlanItem) =>
  child.parentAnnualId === parent.id ||
  child.sourceAnnualId === parent.id ||
  child.parentQuarterlyId === parent.id ||
  child.sourceQuarterlyId === parent.id ||
  sameDomain(child, parent);

export function weeklyTaskProgress(item: PlanItem, weekTasks: WeekTask[] = []) {
  const related = weekTasks.filter(task =>
    (task.domainId && item.domainId && task.domainId === item.domainId) ||
    (task.sourceItemId && task.sourceItemId === item.id) ||
    (task.planItemId && task.planItemId === item.id) ||
    (task.domain && item.domain && normalized(task.domain) === normalized(item.domain))
  );
  if (related.length) {
    return average(related.map(task => (task.completed ? 100 : progressValue(task.progress))));
  }
  return progressValue(item.progress);
}

export function quarterlyItemProgress(
  item: PlanItem,
  monthlyItems: PlanItem[] = [],
  weekTasks: WeekTask[] = []
) {
  const descendants = monthlyItems.filter(child =>
    child.sourceQuarterlyId === item.id ||
    child.parentQuarterlyId === item.id ||
    (child.sourceQuarter === item.quarter && sameDomain(child, item))
  );
  return descendants.length
    ? average(descendants.map(child => weeklyTaskProgress(child, weekTasks)))
    : progressValue(item.progress);
}

export function annualItemProgress(
  item: PlanItem,
  quarterlyItems: PlanItem[] = [],
  monthlyItems: PlanItem[] = [],
  weekTasks: WeekTask[] = []
) {
  const descendants = quarterlyItems.filter(child => linkedTo(child, item));
  if (descendants.length) {
    return average(
      descendants.map(child => quarterlyItemProgress(child, monthlyItems, weekTasks))
    );
  }
  const monthlyDescendants = monthlyItems.filter(child => linkedTo(child, item));
  return monthlyDescendants.length
    ? average(monthlyDescendants.map(child => weeklyTaskProgress(child, weekTasks)))
    : progressValue(item.progress);
}

export function totalAnnualHours(items: PlanItem[] = []) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.hours) || 0), 0);
}

export function sortPlanItemsByTrack(items: PlanItem[] = [], trackOrder: string[] = []) {
  const order = new Map(trackOrder.map((track, index) => [track, index]));
  return [...items].sort(
    (left, right) =>
      (order.get(left.track) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.track) ?? Number.MAX_SAFE_INTEGER)
  );
}

export function selectPlanItemsByIds(items: PlanItem[] = [], ids: string[] = []) {
  const selected = new Set(ids);
  return items.filter(item => selected.has(item.id));
}

export function createQuarterlyPlanItem(
  annualParent: PlanItem,
  quarter: string,
  hours: number,
  id: string
) {
  return {
    id,
    track: annualParent?.track,
    domain: annualParent?.domain,
    parentDomain: annualParent?.domain,
    parentAnnualId: annualParent?.id,
    title: annualParent?.title || annualParent?.domain,
    description: annualParent?.description || "",
    quarter,
    progress: 0,
    hours: Math.max(0, Number(hours) || 0),
  };
}

export function createQuarterlyPlanItems(
  annualParents: PlanItem[] = [],
  quarter: string,
  hoursFor: (parent: PlanItem) => number = parent => Number(parent.hours || 0),
  idPrefix = "quarterly"
) {
  return annualParents.map((parent, index) =>
    createQuarterlyPlanItem(
      parent,
      quarter,
      hoursFor(parent),
      `${idPrefix}-${index}`,
    )
  );
}

export function availableAnnualDomainsForQuarter(
  annualItems: PlanItem[] = [],
  quarterlyItems: PlanItem[] = [],
  quarter?: string
) {
  return annualItems.filter(item =>
    !quarterlyItems.some(child =>
      (quarter ? (child.quarter || "q1") === quarter : true) && linkedTo(child, item)
    )
  );
}

export function quarterlySelectionsForAnnualItem(
  annualItem: PlanItem,
  quarterlyItems: PlanItem[] = [],
  quarterTabs: PlanItem[] = []
) {
  return quarterTabs.filter(quarter =>
    quarterlyItems.some(
      item =>
        (item.quarter || "q1") === quarter.key && linkedTo(item, annualItem)
    )
  );
}

export function dailyBattleItems(items: PlanItem[] = [], today?: string) {
  const date = today || new Date().toISOString().slice(0, 10);
  return items.filter(item => {
    if (isReviewItem(item)) return false;
    const itemDate = item.date || item.plannedDate || item.scheduledDate;
    return !itemDate || String(itemDate).slice(0, 10) <= date;
  });
}

export function isReviewItem(item: PlanItem = {}) {
  return Boolean(
    item.isReview ||
      item.kind === "review" ||
      item.battleKind === "review" ||
      item.reviewStage != null ||
      item.reviewIndex != null ||
      item.reviewDate
  );
}

export function activeBattleItems(items: PlanItem[] = []) {
  return items.filter(item => progressValue(item.progress) < 100);
}

export function syncDailyCompletion(
  items: PlanItem[] = [],
  domain: string,
  title: string,
  completed: boolean
) {
  return items.map(item =>
    normalized(item.domain) === normalized(domain) && normalized(item.title) === normalized(title)
      ? { ...item, completed, progress: completed ? 100 : 0 }
      : item
  );
}

export function removeAnnualDomainTree(
  planItems: Record<string, PlanItem[]> = {},
  weekTasks: WeekTask[] = [],
  annualId: string
) {
  const annual = (planItems.annual || []).find(item => item.id === annualId);
  if (!annual) return { planItems, weekTasks };
  const isDescendant = (item: PlanItem) =>
    item.id === annualId ||
    item.parentAnnualId === annualId ||
    item.sourceAnnualId === annualId ||
    sameDomain(item, annual);
  const nextPlanItems = Object.fromEntries(
    Object.entries(planItems).map(([level, items]) => [
      level,
      (items || []).filter(item => level === "annual" ? item.id !== annualId : !isDescendant(item)),
    ])
  );
  const nextWeekTasks = weekTasks.filter(task =>
    !(
      (task.domainId && annual.id === task.domainId) ||
      (task.domain && sameDomain(task, annual)) ||
      (task.parentAnnualId && task.parentAnnualId === annual.id)
    )
  );
  return { planItems: nextPlanItems, weekTasks: nextWeekTasks };
}

export function linkedPlanProgress(item: PlanItem, linkedItems: PlanItem[] = []) {
  const related = linkedItems.filter(child => linkedTo(child, item));
  return related.length ? average(related.map(child => progressValue(child.progress))) : progressValue(item.progress);
}
