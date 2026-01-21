# Context Manager Redesign & Bug Fixes

## Critical Bugs Fixed

### 1. **Search Only Returning Duplicates**
**Problem**: Search was querying the IndexedDB storage layer which had ID collisions, causing only 2 duplicate items to appear.

**Solution**: Completely rewrote search to query against the actual `messages` array instead of stored items. Now searches **all messages** in the current conversation.

**How it works now**:
- Searches all messages (user messages, model responses, steward notes)
- Uses both keyword matching AND SRG semantic similarity
- Scores results by relevance (0-1)
- Filters out noise (< 5% relevance)
- Sorted by relevance descending

### 2. **No Way to Recover Archived Items**
**Problem**: Removing items moved them to archive but there was no restore button.

**Solution**: 
- Added "Restore" button on each archived item
- Archived items now store the `messageUuid` reference
- Clicking restore toggles the message back to LIVE context

### 3. **Missing "Add All" for Search Results**
**Problem**: Had to add search results one by one.

**Solution**: Added "Add All" button that adds all search results to context at once.

## UI/UX Improvements

### Layout Redesign
**Before**: Everything stacked vertically, save/load took up massive space, hard to see current context

**After**: 
```
┌─────────────────────────────────────────────┬──────────────┐
│  4/5 Width: MAIN CONTEXT AREA              │ 1/5 Width:   │
│                                             │ WORKSPACES   │
│  ┌─ Search (with Add All button)          │              │
│  ├─ Current In Context (files+messages)   │ ┌─ Save      │
│  ├─ Archived (collapsible, restore btns)  │ ├─ Load      │
│  └─                                        │ └─ Restore   │
└─────────────────────────────────────────────┴──────────────┘
```

### Clear Button Downsized
**Before**: Full-width red panic button that's too prominent

**After**: Small `px-1.5 py-0.5` button in the header, not a panic switch

### Archive Section
- Now collapsible `<details>` element to save space
- Shows "Archived (X)" count
- Individual Restore buttons for each item
- Items show truncated text with restore option

## Data Flow Changes

### Removing Items from Context
**Before**: Used `moveItemToTier()` which left items in DEEP but didn't fully persist

**After**: Full `storeContextItem()` to DEEP tier with:
```typescript
{
    id: messageUuid,
    text: messageText,
    tier: 'DEEP',
    messageUuid: messageUuid,  // <-- Key for restore
    ... other fields
}
```

### Restoring from Archive
1. User sees archived item
2. Clicks "Restore" button
3. System calls `onToggleMessageContext(messageUuid)`
4. Message is set `isInContext: true`
5. Item stored to 'LIVE' tier
6. Removed from archive display

## Search Features

### What It Finds
- Keyword matching (direct word inclusion)
- SRG semantic similarity (conceptual relationships)
- Handles partial words and synonyms via SRG

### Example Searches
- `"authentication"` → finds all auth-related messages
- `"reflex"` → finds all messages containing "reflex" (not just 2 duplicates!)
- `"database design"` → finds DB architecture messages even if exact phrase isn't there
- `"error handling"` → finds exception/error-related content

### Score Breakdown
- **Keyword Match**: 20% weight
- **SRG Semantic**: 80% weight (if available)
- **Threshold**: Must score ≥5% relevance to display

## Workspace Functionality

### Save Workspace
1. Type workspace name (or auto-generates `ws_TIMESTAMP`)
2. Saves all currently-in-context items + file IDs
3. Stored in IndexedDB

### Load Workspace
1. Select from dropdown
2. Click "Restore"
3. All messages marked `isInContext: true`
4. All files added to context
5. All items stored to 'LIVE' tier

## Testing Checklist

- [ ] Search finds "reflex" (should return 3+ items, not 2)
- [ ] "Add All" button works on search results
- [ ] Removing message from context moves it to archive
- [ ] Restore button in archive brings message back to context
- [ ] Clear button is small/non-prominent
- [ ] Save workspace saves current context items
- [ ] Load workspace restores both messages AND files
- [ ] Semantic search works (e.g., "authentication" finds related items)

## Files Modified

- `components/ChatPanel.tsx` - Complete modal redesign with new search
- `hooks/useChat.ts` - Fixed toggleMessageContext to store to DEEP on remove
- `services/contextSearchService.ts` - Created new service (for future use)

## Known Limitations

- Search is in-memory (searches active messages only, not historical DB)
- Archive restore only works for messages that still exist in `messages` array
- Semantic search depends on SRG service being initialized
