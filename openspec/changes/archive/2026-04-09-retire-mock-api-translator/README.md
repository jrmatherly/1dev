# retire-mock-api-translator

Retire the 657-line `src/renderer/lib/mock-api.ts` shim that mimics the dead upstream `21st.dev` API (now `apollosai.dev` for the local fork) by translating typed Drizzle/tRPC output back into snake_case shapes, in three phases (timestamp fossil → real consumer migration → upstream-stub extraction). Phase 1 (this proposal) eliminates the timestamp fossil in 8 consumer files plus the sub-chat Zustand store, while explicitly preserving F1/F2 boundary translation sites.
