"use client";

import { useSetAtom } from "jotai";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

import { ClaudeCodeIcon, IconSpinner } from "../../components/ui/icons";
import { Logo } from "../../components/ui/logo";
import {
  anthropicOnboardingCompletedAtom,
  billingMethodAtom,
} from "../../lib/atoms";
import { trpc } from "../../lib/trpc";

export function AnthropicOnboardingPage() {
  const [isUsingExistingToken, setIsUsingExistingToken] = useState(false);
  const [existingTokenError, setExistingTokenError] = useState<string | null>(
    null,
  );
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  );
  const setBillingMethod = useSetAtom(billingMethodAtom);

  const handleBack = () => {
    setBillingMethod(null);
  };

  // tRPC mutations and queries
  const importSystemTokenMutation =
    trpc.claudeCode.importSystemToken.useMutation();
  const existingTokenQuery = trpc.claudeCode.getSystemToken.useQuery();
  const existingToken = existingTokenQuery.data?.token ?? null;
  const hasExistingToken = !!existingToken;
  const checkedExistingToken = !existingTokenQuery.isLoading;

  const handleUseExistingToken = async () => {
    if (isUsingExistingToken) return;

    setIsUsingExistingToken(true);
    setExistingTokenError(null);

    try {
      await importSystemTokenMutation.mutateAsync();
      setAnthropicOnboardingCompleted(true);
    } catch (err) {
      setExistingTokenError(
        err instanceof Error ? err.message : "Failed to use existing token",
      );
      setIsUsingExistingToken(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button - fixed in top left corner below traffic lights */}
      <button
        onClick={handleBack}
        className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="w-full max-w-[440px] space-y-8 px-4">
        {/* Header with dual icons */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-5 h-5" />
            </div>
            <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
              <ClaudeCodeIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Connect Claude Code
            </h1>
            <p className="text-sm text-muted-foreground">
              Connect your Claude Code subscription to get started
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 flex flex-col items-center">
          {/* Loading state while checking for existing token */}
          {!checkedExistingToken && (
            <div className="flex items-center justify-center py-4">
              <IconSpinner className="h-5 w-5" />
            </div>
          )}

          {/* Existing token found — offer to use it */}
          {checkedExistingToken && hasExistingToken && (
            <div className="space-y-4 w-full">
              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <p className="text-sm font-medium">
                  Existing Claude Code credentials found
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Found credentials from your Claude CLI login.
                </p>
              </div>
              {existingTokenError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {existingTokenError}
                  </p>
                </div>
              )}
              <button
                onClick={handleUseExistingToken}
                disabled={isUsingExistingToken}
                className="h-8 px-3 w-full bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isUsingExistingToken ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  "Use existing token"
                )}
              </button>
            </div>
          )}

          {/* No existing token — instruct user to run claude /login */}
          {checkedExistingToken && !hasExistingToken && (
            <div className="space-y-4 w-full">
              <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-2">
                <p className="text-sm font-medium">
                  Connect via Claude CLI
                </p>
                <p className="text-xs text-muted-foreground">
                  Run{" "}
                  <code className="px-1 py-0.5 bg-background border border-border rounded text-xs font-mono">
                    claude /login
                  </code>{" "}
                  in your terminal, then click the button below.
                </p>
              </div>
              {existingTokenError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {existingTokenError}
                  </p>
                </div>
              )}
              <button
                onClick={handleUseExistingToken}
                disabled={isUsingExistingToken}
                className="h-8 px-3 w-full bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isUsingExistingToken ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  "Use existing Claude CLI login"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
