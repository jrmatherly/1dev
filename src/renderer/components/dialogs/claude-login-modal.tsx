"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { X } from "lucide-react";
import { useState } from "react";
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms";
import {
  agentsLoginModalOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  claudeLoginModalConfigAtom,
  type SettingsTab,
} from "../../lib/atoms";
import { appStore } from "../../lib/jotai-store";
import { trpc } from "../../lib/trpc";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons";
import { Logo } from "../ui/logo";

type ClaudeLoginModalProps = {
  hideCustomModelSettingsLink?: boolean;
  autoStartAuth?: boolean;
};

export function ClaudeLoginModal({
  hideCustomModelSettingsLink = false,
}: ClaudeLoginModalProps) {
  const [open, setOpen] = useAtom(agentsLoginModalOpenAtom);
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  );
  // Pull the full modal config from the atom rather than props so the
  // Add Anthropic Account wizard can pass `onTokenStored` alongside the
  // flags it already sets via `setClaudeLoginModalConfig`.
  const loginModalConfig = useAtomValue(claudeLoginModalConfigAtom);
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom);
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom);
  const [isUsingExistingToken, setIsUsingExistingToken] = useState(false);
  const [existingTokenError, setExistingTokenError] = useState<string | null>(
    null,
  );

  // tRPC mutations
  const importSystemTokenMutation =
    trpc.claudeCode.importSystemToken.useMutation();
  const trpcUtils = trpc.useUtils();

  // Helper to trigger retry after successful auth
  const triggerAuthRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom);
    if (pending?.provider === "claude-code") {
      console.log(
        "[ClaudeLoginModal] Auth success - triggering retry for subChatId:",
        pending.subChatId,
      );
      appStore.set(pendingAuthRetryMessageAtom, {
        ...pending,
        readyToRetry: true,
      });
    }
  };

  // Helper to clear pending retry (on cancel/close without success)
  const clearPendingRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom);
    if (pending?.provider === "claude-code" && !pending.readyToRetry) {
      console.log(
        "[ClaudeLoginModal] Modal closed without success - clearing pending retry",
      );
      appStore.set(pendingAuthRetryMessageAtom, null);
    }
  };

  const handleAuthSuccess = () => {
    triggerAuthRetry();
    setAnthropicOnboardingCompleted(true);
    setOpen(false);
    void Promise.allSettled([
      trpcUtils.anthropicAccounts.list.invalidate(),
      trpcUtils.anthropicAccounts.getActive.invalidate(),
      trpcUtils.claudeCode.getIntegration.invalidate(),
    ]).then(async () => {
      // Fire the post-token-store hook AFTER invalidation so callers (e.g.
      // the Add Anthropic Account wizard) can read the freshly-created
      // account row via getActive. Errors in the hook are logged but not
      // surfaced; the account itself is already valid.
      if (loginModalConfig.onTokenStored) {
        try {
          await loginModalConfig.onTokenStored();
        } catch (err) {
          console.error("[ClaudeLoginModal] onTokenStored hook failed:", err);
        }
      }
    });
  };

  const handleUseExistingToken = async () => {
    if (isUsingExistingToken) return;

    setIsUsingExistingToken(true);
    setExistingTokenError(null);

    try {
      await importSystemTokenMutation.mutateAsync();
      handleAuthSuccess();
    } catch (err) {
      setExistingTokenError(err instanceof Error ? err.message : String(err));
      setIsUsingExistingToken(false);
    }
  };

  const handleOpenModelsSettings = () => {
    clearPendingRetry();
    setSettingsActiveTab("models" as SettingsTab);
    setSettingsOpen(true);
    setOpen(false);
  };

  // Handle modal open/close - clear pending retry if closing without success
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      clearPendingRetry();
      setIsUsingExistingToken(false);
      setExistingTokenError(null);
    }
    setOpen(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[380px] p-6">
        {/* Close button */}
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>

        <div className="space-y-8">
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
                Claude Code
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect your Claude Code subscription
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-2">
              <p className="text-sm font-medium">Connect via Claude CLI</p>
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
                <p className="text-sm text-destructive">{existingTokenError}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Make sure you have run{" "}
                  <code className="px-1 py-0.5 bg-background border border-border rounded text-xs font-mono">
                    claude /login
                  </code>{" "}
                  in your terminal and try again.
                </p>
              </div>
            )}

            <Button
              onClick={handleUseExistingToken}
              className="w-full"
              disabled={isUsingExistingToken}
            >
              {isUsingExistingToken ? (
                <IconSpinner className="h-4 w-4" />
              ) : (
                "Use existing Claude CLI login"
              )}
            </Button>

            {!hideCustomModelSettingsLink && (
              <div className="text-center mt-2!">
                <button
                  type="button"
                  onClick={handleOpenModelsSettings}
                  className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Set a custom model in Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
