# Importing Conversations (draft)

This document describes the minimal format and how to use the `chatImportService`.

Format (recommended line-delimited JSON):

Each entry should be an object with these fields:
- `source`: string e.g. `chatgpt`, `claude`
- `conversationId`: optional string grouping turns into a thread
- `role`: `user` | `assistant` | `system` | `model`
- `timestamp`: optional epoch ms or ISO timestamp string
- `text`: string content of the turn

Example lines:

{ "source": "chatgpt", "conversationId": "conv-1", "role": "user", "timestamp": 1690000000000, "text": "Hello" }
{ "source": "chatgpt", "conversationId": "conv-1", "role": "assistant", "timestamp": 1690000001000, "text": "Hi there" }

Usage (programmatic):
- Use `importEntries(entries: ChatImportEntry[])` from `services/chatImportService.ts` to import an array of parsed entries.
- The function maps entries to partial `MemoryAtom` objects and calls `memoryService.ingestBulk(...)`.
- `memoryService.createAtom` will forward text to SRG storage (so imported content is considered for SRG/resurfacing).

Turn pairing and reply linking:
- Entries are grouped per `conversationId` (or grouped under `'default'` if missing) and processed in timestamp order.
- When an assistant/model turn follows a user turn, the importer will set `replyToTurnId` so the `memoryService` cross-links the two turns (each atom's `traceIds` will include the other's `turnId`).

UI:
- The Sidebar contains an **Import Chats** button that accepts a line-delimited JSON file or a JSON array of entries in the format described above. Imported turns appear as MemoryAtoms and are indexed by SRG_user / SRG_model depending on role.

Developer testing:
- You can trigger the Jellybean onboarding test automatically on app launch by adding `?jellybeanTest=1` to the app URL; this will open the jellybean sorter and simulate a verification payload so you can exercise onboarding flows programmatically.

UI integration (suggested):
- File picker that reads line-delimited JSON
- Parse each line to `ChatImportEntry` and call `importEntries`
- Optionally show an "Imported Conversations" panel listing distinct `conversationId` + `source` values

Notes:
- Imported atoms set `isInContext: false` by default and are collapsed; the UI can allow pinning to context or toggling `isInContext`.
- The `types` module now includes `source?: string` and `conversationId?: string` on `MemoryAtom`, and `IMPORTED_HISTORY` has been added to `ALL_CONTEXT_PACKETS`.
