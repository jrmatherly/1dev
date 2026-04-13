/// <reference types="vite/client" />

// Extend Vite's ImportMetaEnv with our custom env vars
declare global {
  interface ImportMetaEnv {
    // Main process (MAIN_VITE_ prefix)
    readonly MAIN_VITE_SENTRY_DSN?: string;
    readonly MAIN_VITE_POSTHOG_KEY?: string;
    readonly MAIN_VITE_POSTHOG_HOST?: string;
    readonly MAIN_VITE_API_URL?: string;
    readonly MAIN_VITE_DEV_BYPASS_AUTH?: string;
    readonly MAIN_VITE_OPENAI_API_KEY?: string;
    // Enterprise Entra ID auth (dev-only; packaged builds use DB / Settings UI)
    readonly MAIN_VITE_ENTERPRISE_AUTH_ENABLED?: string;
    readonly MAIN_VITE_ENTRA_CLIENT_ID?: string;
    readonly MAIN_VITE_ENTRA_TENANT_ID?: string;

    // Renderer process (VITE_ prefix)
    readonly VITE_POSTHOG_KEY?: string;
    readonly VITE_POSTHOG_HOST?: string;
  }
}

export {};
