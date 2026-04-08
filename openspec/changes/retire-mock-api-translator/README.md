# retire-mock-api-translator

Retire the 657-line `src/renderer/lib/mock-api.ts` shim that mimics the dead 21st.dev API by translating typed Drizzle/tRPC output back into snake_case shapes, in three phases (timestamp fossil → real consumer migration → upstream-stub extraction). Phase 1 (this proposal) eliminates the timestamp/`stream_id` fossil in 8 consumer files and the sub-chat Zustand store.
