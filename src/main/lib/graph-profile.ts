/**
 * Microsoft Graph profile fetcher for the signed-in enterprise user.
 *
 * Issues two parallel calls against `graph.microsoft.com/v1.0`:
 *   1. `/me?$select=...` — name, mail, jobTitle, department, officeLocation
 *   2. `/me/photo/$value` — profile photo blob, converted to a data URL
 *
 * Profile-endpoint failures throw `GraphProfileError` (caller decides fallback).
 * Photo-endpoint 404/403 return `avatarDataUrl: null` without throwing — "no
 * photo available" is a normal state (user hasn't uploaded one, or tenant
 * policy hides photos). Other non-200 photo responses log a warning and
 * degrade to null.
 *
 * === credential-storage boundary (see .claude/rules/credential-storage.md) ===
 * The `token` parameter is a short-lived Graph access token acquired via
 * `EnterpriseAuth.acquireTokenForGraph()`. It is passed by value, held only
 * on the stack for the duration of the two HTTP calls, and never persisted.
 * This module intentionally does NOT import from `credential-store.ts` —
 * Graph access tokens are ephemeral (rotated on MSAL's refresh cycle) and
 * encrypting them to durable storage would be strictly worse than keeping
 * them in memory. See `openspec/specs/enterprise-auth/spec.md` scenario
 * "Graph access token does not flow through credential-store.ts".
 * ===========================================================================
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const PROFILE_URL = `${GRAPH_BASE}/me?$select=displayName,mail,jobTitle,department,officeLocation`;
const PHOTO_URL = `${GRAPH_BASE}/me/photo/$value`;

/**
 * Subset of the Microsoft Graph `/me` response plus our derived avatar URL.
 * All text fields except `displayName` are nullable — tenant policy or
 * user profile completeness may leave any of them blank. `avatarDataUrl`
 * is null when the photo endpoint returns 404/403 or any non-200 status.
 */
export interface GraphProfile {
  displayName: string;
  mail: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  avatarDataUrl: string | null;
}

/**
 * Thrown when the Graph `/me` profile call fails. The caller (the
 * `enterpriseAuth.getGraphProfile` tRPC procedure) translates this into a
 * null return so the renderer can fall back to `desktopApi.getUser()`.
 */
export class GraphProfileError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GraphProfileError";
    this.status = status;
  }
}

interface RawProfile {
  displayName?: string | null;
  mail?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
}

async function fetchProfileFields(token: string): Promise<RawProfile> {
  const response = await fetch(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new GraphProfileError(
      response.status,
      `Graph /me returned ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as RawProfile;
}

async function fetchAvatarDataUrl(token: string): Promise<string | null> {
  const response = await fetch(PHOTO_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "image/*",
    },
  });

  if (response.status === 404 || response.status === 403) {
    // No photo set (404) or tenant policy hides photos (403) — valid null.
    return null;
  }

  if (!response.ok) {
    console.warn(
      `[graph-profile] /me/photo/$value returned ${response.status} — falling back to initials avatar`,
    );
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return `data:${contentType};base64,${base64}`;
}

/**
 * Fetch the signed-in user's Graph profile and avatar in parallel.
 *
 * Partial success is a valid return shape: a populated `displayName` with
 * `avatarDataUrl: null` is the common case for users without a profile
 * photo. A failed profile call throws `GraphProfileError`; a failed photo
 * call degrades the avatar to null.
 */
export async function fetchGraphProfile(token: string): Promise<GraphProfile> {
  const [rawProfile, avatarDataUrl] = await Promise.all([
    fetchProfileFields(token),
    fetchAvatarDataUrl(token),
  ]);

  return {
    displayName: rawProfile.displayName ?? "",
    mail: rawProfile.mail ?? null,
    jobTitle: rawProfile.jobTitle ?? null,
    department: rawProfile.department ?? null,
    officeLocation: rawProfile.officeLocation ?? null,
    avatarDataUrl,
  };
}
