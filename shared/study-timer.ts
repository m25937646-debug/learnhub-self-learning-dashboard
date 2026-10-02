type StudySession = Record<string, any>;

export function advanceStudyTimer(seconds: number) {
  return Math.max(0, Math.floor(Number(seconds) || 0) - 1);
}

export function clampStudyDuration(minutes: number) {
  const value = Math.round(Number(minutes) || 25);
  return Math.min(180, Math.max(5, value));
}

export function formatStudyTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  return {
    minutes: Math.floor(safeSeconds / 60),
    seconds: safeSeconds % 60,
  };
}

export function totalStudiedSecondsForDomain(
  sessions: StudySession[] = [],
  domainId?: string
) {
  return sessions.reduce((total, session) => {
    if (domainId && session.domainId !== domainId) return total;
    return total + Math.max(0, Math.floor(Number(session.durationSeconds) || 0));
  }, 0);
}
