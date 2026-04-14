/**
 * tRPC router for querying the LiteLLM proxy's model catalog.
 *
 * Group 8 of `add-dual-mode-llm-routing`. The BYOK-LiteLLM wizard (Group 9
 * of the same change) calls this router to auto-populate the
 * Sonnet/Haiku/Opus model-map dropdowns with whatever model ids the user's
 * virtual key is allowed to see on our LiteLLM deployment, eliminating
 * hand-copying errors.
 *
 * Contract:
 *   - Input:  `{ virtualKey: string }` — the user's LiteLLM API key
 *   - Output: `{ models: Array<{ id: string }> }` — one entry per allowed model
 *
 * Implementation: `GET ${MAIN_VITE_LITELLM_BASE_URL}/v1/models` with
 * `Authorization: Bearer ${virtualKey}`. LiteLLM's `/v1/models` endpoint
 * is OSS (not gated behind the Enterprise license).
 *
 * Error shape (all thrown as TRPCError with a user-facing message):
 *   - INTERNAL_SERVER_ERROR — `MAIN_VITE_LITELLM_BASE_URL` unset (operator misconfig)
 *   - UNAUTHORIZED          — LiteLLM returns 401 (invalid virtual key)
 *   - BAD_GATEWAY           — Network error / proxy unreachable
 *   - UNPROCESSABLE_CONTENT — LiteLLM returns 200 but the response body
 *                             doesn't match the expected `{data: [...]}` shape
 *
 * Why no Zod output schema: LiteLLM's `/v1/models` response is an
 * OpenAI-compatible envelope `{ object: "list", data: [{id, object,
 * owned_by, created}, ...] }`. We intentionally project to the minimal
 * `{ id }` shape so wizard consumers don't couple to the full upstream
 * contract. Full shape is validated at the boundary before projection.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../index";

interface LiteLlmModelsResponse {
  object?: string;
  data: Array<{ id: string }>;
}

function parseModelsResponse(body: unknown): Array<{ id: string }> {
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !Array.isArray((body as { data: unknown }).data)
  ) {
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: "LiteLLM /v1/models returned an unexpected response shape",
    });
  }
  const typed = body as LiteLlmModelsResponse;
  const models: Array<{ id: string }> = [];
  for (const entry of typed.data) {
    if (entry && typeof entry.id === "string" && entry.id.length > 0) {
      models.push({ id: entry.id });
    }
  }
  return models;
}

export const litellmModelsRouter = router({
  /**
   * List the LiteLLM models visible to the supplied virtual key.
   *
   * Used by the BYOK-LiteLLM onboarding wizard's "Fetch Models" button to
   * populate the Sonnet/Haiku/Opus dropdowns. Returns `{ models: [] }` if
   * the key is valid but has no models allowlisted — callers should treat
   * empty-array as a soft error and fall through to manual entry.
   */
  listUserModels: publicProcedure
    .input(z.object({ virtualKey: z.string().min(1) }))
    .query(async ({ input }) => {
      const baseUrl = process.env.MAIN_VITE_LITELLM_BASE_URL;
      if (!baseUrl || baseUrl.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "MAIN_VITE_LITELLM_BASE_URL is not configured — set it in .env and restart the app",
        });
      }

      const url = `${baseUrl.replace(/\/+$/, "")}/v1/models`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${input.virtualKey}`,
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        console.error("[litellm-models] fetch failed:", err);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `LiteLLM proxy unreachable at ${baseUrl} — check network or proxy status`,
        });
      }

      if (response.status === 401 || response.status === 403) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "LiteLLM rejected the virtual key. Verify the key is active and has `/v1/models` access.",
        });
      }

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `LiteLLM returned ${response.status} for /v1/models`,
        });
      }

      const body = await response.json().catch(() => null);
      const models = parseModelsResponse(body);
      return { models };
    }),
});
