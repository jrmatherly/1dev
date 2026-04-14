/**
 * Add Anthropic Account wizard.
 *
 * Implements the four-step flow spec'd by add-dual-mode-llm-routing Group 9
 * (tasks §9.1–§9.7):
 *
 *   Step 1: account-type chooser (claude-subscription vs byok)
 *   Step 2: routing-mode chooser (direct vs litellm) — conditionally
 *           rendered when MAIN_VITE_ALLOW_DIRECT_ANTHROPIC === "true";
 *           otherwise silently locked to "litellm".
 *   Step 3: credential entry — reuses Claude OAuth import flow for
 *           subscription, plain text input for BYOK. Subscription+litellm
 *           additionally prompts for a LiteLLM virtual key upfront.
 *   Step 4: (BYOK+litellm only) model enumeration via
 *           trpc.litellmModels.listUserModels with regex-best-match
 *           prefill of Sonnet/Haiku/Opus slots.
 *
 * Persistence:
 *   - BYOK paths call trpc.anthropicAccounts.add with the full shape.
 *   - Subscription paths launch the existing Claude login modal, which
 *     reuses storeOAuthToken() (already writes accountType +
 *     routingMode). For subscription+litellm, the collected virtual key
 *     is stitched onto the newly-created account via
 *     trpc.anthropicAccounts.attachVirtualKey once the OAuth completes.
 *
 * Spec contract:
 *   openspec/changes/add-dual-mode-llm-routing/specs/llm-routing/spec.md
 *   → "ALLOW_DIRECT_ANTHROPIC gates direct-to-Anthropic routing in the UI"
 *   → "LiteLLM model enumeration for BYOK users"
 */

import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
} from "../../lib/atoms";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type AccountType = "claude-subscription" | "byok";
type RoutingMode = "direct" | "litellm";
type WizardStep = "account-type" | "routing-mode" | "credentials" | "models";

// Dev+consumer deployments opt into direct-to-Anthropic routing via this
// env var; enterprise deployments leave it unset so the wizard locks to
// LiteLLM routing. Reading MAIN_VITE_* at module scope matches the
// Electron-vite define-plugin conventions used elsewhere in the repo.
const ALLOW_DIRECT =
  (import.meta.env?.MAIN_VITE_ALLOW_DIRECT_ANTHROPIC as string | undefined) ===
  "true";

// Anthropic API key format: the key prefix "sk-ant-" is followed by a
// segment of lowercase alphanumerics/hyphens; real keys are typically 95+
// chars but 30+ is the documented minimum allowed shape.
const ANTHROPIC_API_KEY_RE = /^sk-ant-[a-z0-9-]{30,}/i;

interface AddAnthropicAccountWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAnthropicAccountWizard({
  open,
  onOpenChange,
}: AddAnthropicAccountWizardProps) {
  const [step, setStep] = useState<WizardStep>("account-type");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [routingMode, setRoutingMode] = useState<RoutingMode>(
    ALLOW_DIRECT ? "direct" : "litellm",
  );
  const [apiKey, setApiKey] = useState("");
  const [virtualKey, setVirtualKey] = useState("");
  const [modelSonnet, setModelSonnet] = useState("");
  const [modelHaiku, setModelHaiku] = useState("");
  const [modelOpus, setModelOpus] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const trpcUtils = trpc.useUtils();
  const setClaudeLoginModalConfig = useSetAtom(claudeLoginModalConfigAtom);
  const setClaudeLoginModalOpen = useSetAtom(agentsLoginModalOpenAtom);

  // `listUserModels` is a tRPC query (not a mutation), so we drive it
  // imperatively via `trpcUtils.*.fetch` and track pending/error state
  // locally. The user clicks "Fetch Models" on demand, which fits a
  // manual-trigger shape better than useQuery's auto-run.
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const addMutation = trpc.anthropicAccounts.add.useMutation();
  const attachVirtualKeyMutation =
    trpc.anthropicAccounts.attachVirtualKey.useMutation();

  // Reset state whenever the dialog opens fresh.
  useEffect(() => {
    if (open) {
      setStep("account-type");
      setAccountType(null);
      setRoutingMode(ALLOW_DIRECT ? "direct" : "litellm");
      setApiKey("");
      setVirtualKey("");
      setModelSonnet("");
      setModelHaiku("");
      setModelOpus("");
      setFetchedModels(null);
      setFetchError(null);
    }
  }, [open]);

  const closeAndInvalidate = useCallback(() => {
    onOpenChange(false);
    void trpcUtils.anthropicAccounts.list.invalidate();
    void trpcUtils.anthropicAccounts.getActive.invalidate();
    void trpcUtils.claudeCode.getIntegration.invalidate();
  }, [onOpenChange, trpcUtils]);

  // Step 1 → next: when ALLOW_DIRECT is false we skip step 2 entirely.
  const goNextFromAccountType = () => {
    if (!accountType) return;
    if (ALLOW_DIRECT) {
      setStep("routing-mode");
    } else {
      // Locked to litellm per design.md Decision 3; skip step 2.
      setRoutingMode("litellm");
      setStep("credentials");
    }
  };

  const handleFetchModels = async () => {
    setFetchError(null);
    setIsFetchingModels(true);
    try {
      const result = await trpcUtils.litellmModels.listUserModels.fetch({
        virtualKey,
      });
      const ids: string[] = result.models.map((m: { id: string }) => m.id);
      setFetchedModels(ids);
      // Regex-best-match prefill; user can override via the dropdowns.
      const pickFirst = (re: RegExp): string =>
        ids.find((id: string) => re.test(id)) ?? "";
      setModelSonnet(pickFirst(/sonnet/i));
      setModelHaiku(pickFirst(/haiku/i));
      setModelOpus(pickFirst(/opus/i));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch models";
      setFetchError(message);
      setFetchedModels(null);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSubmitByok = async () => {
    if (!accountType || accountType !== "byok") return;

    if (routingMode === "direct") {
      if (!ANTHROPIC_API_KEY_RE.test(apiKey.trim())) {
        toast.error(
          "Invalid Anthropic API key format. Expected sk-ant-… (30+ chars).",
        );
        return;
      }
      try {
        await addMutation.mutateAsync({
          accountType: "byok",
          routingMode: "direct",
          apiKey: apiKey.trim(),
          displayName: "BYOK (Direct)",
        });
        toast.success("Account added");
        closeAndInvalidate();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add";
        toast.error(message);
      }
      return;
    }

    // byok-litellm
    if (!virtualKey.trim()) {
      toast.error("A LiteLLM virtual key is required.");
      return;
    }
    if (!modelSonnet.trim() || !modelHaiku.trim() || !modelOpus.trim()) {
      toast.error("All three model slots (Sonnet, Haiku, Opus) are required.");
      return;
    }
    try {
      await addMutation.mutateAsync({
        accountType: "byok",
        routingMode: "litellm",
        virtualKey: virtualKey.trim(),
        modelSonnet: modelSonnet.trim(),
        modelHaiku: modelHaiku.trim(),
        modelOpus: modelOpus.trim(),
        displayName: "BYOK (LiteLLM)",
      });
      toast.success("Account added");
      closeAndInvalidate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add";
      toast.error(message);
    }
  };

  const handleSubmitSubscription = async () => {
    if (accountType !== "claude-subscription") return;

    // For subscription+litellm, capture the virtual key first, then
    // delegate OAuth acquisition to the existing Claude login modal. The
    // modal's importToken / importSystemToken flow calls storeOAuthToken
    // which writes the new account row with accountType="claude-
    // subscription" + the env-derived routingMode. We stitch the virtual
    // key onto that row immediately after.
    if (routingMode === "litellm" && !virtualKey.trim()) {
      toast.error("A LiteLLM virtual key is required for LiteLLM routing.");
      return;
    }

    // Close the wizard BEFORE opening the Claude login modal so they
    // don't stack; the invalidation happens inside the login modal's
    // onSuccess handler chain.
    onOpenChange(false);

    // Capture the virtual key in a closure; after the OAuth modal lands
    // a new account row, we invalidate queries and attach the key to
    // whichever row landed most recently (the just-created one).
    const virtualKeyToAttach =
      routingMode === "litellm" ? virtualKey.trim() : null;

    setClaudeLoginModalConfig({
      hideCustomModelSettingsLink: true,
      autoStartAuth: true,
      onTokenStored: virtualKeyToAttach
        ? async () => {
            // Refetch the active account to discover the row that
            // storeOAuthToken just created and marked active.
            const active = await trpcUtils.anthropicAccounts.getActive.fetch();
            if (!active?.id) {
              toast.warning(
                "OAuth succeeded but no active account was found. Virtual key not attached.",
              );
              return;
            }
            try {
              await attachVirtualKeyMutation.mutateAsync({
                accountId: active.id,
                virtualKey: virtualKeyToAttach,
              });
              toast.success("Account added with LiteLLM virtual key attached");
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Failed to attach virtual key";
              toast.error(message);
            }
          }
        : undefined,
    });
    setClaudeLoginModalOpen(true);
  };

  const title = useMemo(() => {
    switch (step) {
      case "account-type":
        return "Add Anthropic Account";
      case "routing-mode":
        return "Choose routing mode";
      case "credentials":
        return accountType === "byok"
          ? "Enter your credentials"
          : "Sign in with Claude";
      case "models":
        return "Map your models";
    }
  }, [step, accountType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {step === "account-type" && (
          <div className="space-y-3">
            <DialogDescription>
              Pick the option that matches how you authenticate to Claude.
            </DialogDescription>
            <div className="grid gap-2">
              <ChoiceCard
                selected={accountType === "claude-subscription"}
                onClick={() => setAccountType("claude-subscription")}
                title="Existing Claude Code Subscription"
                body="Sign in with your Claude Max / Pro OAuth token."
              />
              <ChoiceCard
                selected={accountType === "byok"}
                onClick={() => setAccountType("byok")}
                title="Bring Your Own API Key"
                body={
                  ALLOW_DIRECT
                    ? "Use an Anthropic API key directly or through LiteLLM."
                    : "Use a LiteLLM virtual key from your enterprise deployment."
                }
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={goNextFromAccountType} disabled={!accountType}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "routing-mode" && (
          <div className="space-y-3">
            <DialogDescription>
              How should requests reach Anthropic?
            </DialogDescription>
            <div className="grid gap-2">
              <ChoiceCard
                selected={routingMode === "direct"}
                onClick={() => setRoutingMode("direct")}
                title="Direct to Anthropic"
                body="Requests go straight to api.anthropic.com."
              />
              <ChoiceCard
                selected={routingMode === "litellm"}
                onClick={() => setRoutingMode("litellm")}
                title="Through LiteLLM"
                body="Requests go through your organization's LiteLLM proxy for centralized audit and rate-limiting."
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("account-type")}>
                Back
              </Button>
              <Button onClick={() => setStep("credentials")}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {step === "credentials" && accountType === "claude-subscription" && (
          <div className="space-y-3">
            <DialogDescription>
              Clicking continue launches the Claude login flow. If you already
              have a Claude CLI session on this machine we'll import it;
              otherwise a browser window opens for you to sign in.
            </DialogDescription>
            {routingMode === "litellm" && (
              <div className="space-y-2">
                <Label htmlFor="virtual-key-sub">
                  LiteLLM virtual key
                  <span className="text-muted-foreground text-xs ml-2">
                    Required for audit attribution
                  </span>
                </Label>
                <Input
                  id="virtual-key-sub"
                  value={virtualKey}
                  onChange={(e) => setVirtualKey(e.target.value)}
                  placeholder="sk-litellm-…"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Ask your LiteLLM administrator for a virtual key scoped to
                  your user. Your Claude Max token authenticates you to
                  Anthropic; this key identifies you to LiteLLM.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() =>
                  ALLOW_DIRECT
                    ? setStep("routing-mode")
                    : setStep("account-type")
                }
              >
                Back
              </Button>
              <Button onClick={handleSubmitSubscription}>
                Launch Claude login
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "credentials" && accountType === "byok" && (
          <div className="space-y-3">
            <DialogDescription>
              {routingMode === "direct"
                ? "Paste your Anthropic API key (starts with sk-ant-)."
                : "Paste your LiteLLM virtual key. We'll query your accessible models next."}
            </DialogDescription>
            {routingMode === "direct" ? (
              <div className="space-y-2">
                <Label htmlFor="api-key">Anthropic API key</Label>
                <Input
                  id="api-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="virtual-key-byok">LiteLLM virtual key</Label>
                <Input
                  id="virtual-key-byok"
                  value={virtualKey}
                  onChange={(e) => setVirtualKey(e.target.value)}
                  placeholder="sk-litellm-…"
                  autoComplete="off"
                />
              </div>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() =>
                  ALLOW_DIRECT
                    ? setStep("routing-mode")
                    : setStep("account-type")
                }
              >
                Back
              </Button>
              {routingMode === "direct" ? (
                <Button
                  onClick={handleSubmitByok}
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending ? "Saving…" : "Save"}
                </Button>
              ) : (
                <Button
                  onClick={() => setStep("models")}
                  disabled={!virtualKey.trim()}
                >
                  Continue
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {step === "models" && (
          <div className="space-y-3">
            <DialogDescription>
              Map Sonnet, Haiku, and Opus to model IDs your LiteLLM proxy
              advertises. Click "Fetch models" to auto-fill with a best match,
              or type IDs manually.
            </DialogDescription>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
              >
                {isFetchingModels ? "Fetching…" : "Fetch models"}
              </Button>
              {fetchedModels && (
                <span className="text-xs text-muted-foreground">
                  {fetchedModels.length} models available
                </span>
              )}
              {fetchError && (
                <span className="text-xs text-red-500">{fetchError}</span>
              )}
            </div>

            <ModelSlot
              label="Sonnet"
              value={modelSonnet}
              onChange={setModelSonnet}
              options={fetchedModels}
            />
            <ModelSlot
              label="Haiku"
              value={modelHaiku}
              onChange={setModelHaiku}
              options={fetchedModels}
            />
            <ModelSlot
              label="Opus"
              value={modelOpus}
              onChange={setModelOpus}
              options={fetchedModels}
            />

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("credentials")}>
                Back
              </Button>
              <Button
                onClick={handleSubmitByok}
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left rounded-md border p-3 transition-colors " +
        (selected
          ? "border-foreground bg-muted"
          : "border-border hover:border-foreground/50")
      }
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{body}</div>
    </button>
  );
}

function ModelSlot({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[] | null;
}) {
  // When fetched model list is available, render a dropdown fed by the
  // returned IDs; otherwise fall back to plain text input so the user can
  // still complete account creation when /v1/models is unreachable.
  return (
    <div className="space-y-1">
      <Label htmlFor={`model-${label.toLowerCase()}`}>{label}</Label>
      {options && options.length > 0 ? (
        <select
          id={`model-${label.toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">(select a model)</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`model-${label.toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`e.g. claude-${label.toLowerCase()}-4`}
        />
      )}
    </div>
  );
}
