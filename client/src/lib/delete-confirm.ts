export type DeleteAction = () => void;

/** Route delete requests from child components through App's PIN-aware dialog. */
export function requestDeleteConfirmation(label: string, action: DeleteAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("learnhub:confirm-delete", { detail: { label, action } }));
}
