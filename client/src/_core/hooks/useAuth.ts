import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // Login is started via startLogin() in the effect below, only when we actually
  // navigate — never during render. startLogin() mints a one-time nonce + writes
  // the state cookie, so calling it per render would overwrite the cookie and
  // desync it from an in-flight login's `state`.
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  // Local Vite development stays in guest mode, while the managed HTTPS
  // Preview uses the real OAuth session so users can choose their Gmail.
  const managedPreview = typeof window !== "undefined" && window.location.hostname.endsWith(".manus.computer");
  const previewRuntime = import.meta.env.DEV && !managedPreview;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !previewRuntime,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // Clear the Preview auto-login token mirrored into sessionStorage, so
      // header-based sessions (Safari ITP / WebView) are logged out too. The
      // backend cookie is cleared by the logout mutation.
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    // Only local development is an intentional guest sandbox. Managed Preview
    // must keep an unauthenticated user unauthenticated so the Gmail login UI
    // remains available instead of fabricating a guest account.
    const previewGuest = previewRuntime;
    const guestUser = previewGuest
      ? { id: null, openId: "learnhub-preview-guest", name: "زائر LearnHub", email: null }
      : null;
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(guestUser || meQuery.data)
    );
    return {
      user: guestUser || (meQuery.isError ? null : meQuery.data ?? null),
      isGuest: Boolean(guestUser),
      loading: (!previewRuntime && meQuery.isLoading) || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: !previewGuest && !meQuery.isLoading && !meQuery.isError && Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.isError,
    meQuery.isFetching,
    meQuery.error,
    meQuery.isLoading,
    previewRuntime,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isFetching || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    // Navigate at this moment only. startLogin() mints the nonce + cookie itself.
    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isFetching,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
