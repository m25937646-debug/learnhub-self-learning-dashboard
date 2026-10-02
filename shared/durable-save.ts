export type RevisionedSnapshot = {
  meta?: {
    localRevision?: unknown;
  };
};

export const snapshotRevision = (snapshot: RevisionedSnapshot | null | undefined) =>
  Number(snapshot?.meta?.localRevision || 0);

export const pickNewestSnapshot = <T extends RevisionedSnapshot>(
  snapshots: Array<T | null | undefined>,
  isUsable: (snapshot: T) => boolean,
): T | null =>
  snapshots
    .filter((snapshot): snapshot is T => Boolean(snapshot))
    .filter(snapshot => isUsable(snapshot))
    .sort((left, right) => snapshotRevision(right) - snapshotRevision(left))[0] || null;

export const shouldAcceptRevision = (
  existingRevision: unknown,
  incomingRevision: unknown,
) => snapshotRevision({ meta: { localRevision: existingRevision } }) <=
  snapshotRevision({ meta: { localRevision: incomingRevision } });
