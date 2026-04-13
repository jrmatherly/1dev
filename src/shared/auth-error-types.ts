/**
 * Shared discriminated union for auth-flow errors crossing the IPC
 * boundary. Imported by the main-process sanitizer
 * (`src/main/lib/auth-error.ts`), the preload bridge
 * (`src/preload/index.ts`), the preload type declarations
 * (`src/preload/index.d.ts`), and the renderer login surface.
 *
 * Spec: openspec/specs/enterprise-auth-wiring/spec.md →
 *   "Auth error IPC payload is a typed discriminated union"
 */
export type AuthError =
  | { kind: "flag-off"; message: string }
  | { kind: "config-missing"; message: string }
  | { kind: "init-failed"; message: string }
  | { kind: "msal-error"; message: string };
