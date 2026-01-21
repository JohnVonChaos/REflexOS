# Quick Reference: Session Export/Import & Workflow Profiles

## 🎯 What Changed

Your app now has:
1. **Full session export** - Saves workflow, settings, preferences with workspaces
2. **Selective import** - Choose what to import (merge or replace)
3. **Profile management** - Save/load workflow configurations separately
4. **Easy profile swapping** - Switch between different cognitive modes instantly

---

## 🚀 How to Use

### Save a Workspace with Full State

**Before (limited export):**
```
Context Manager → Save Workspace
→ Only saved message IDs and file IDs
```

**Now (full state export):**
```
Context Manager → Save Workspace
→ Saves messages, files, workflow, settings, preferences
```

> **Tip:** Use this when you want to preserve your entire session setup

---

### Load a Workspace Selectively

**Before (all-or-nothing):**
```
Context Manager → Select Workspace → Restore
→ Loading messages, files only
```

**Now (choose what to load):**
```
Context Manager → Select Workspace → Restore
→ SessionImportModal appears
→ Choose which components:
   ☑ Workflow         [Replace▼] or [Merge▼]
   ☑ AI Settings      [Replace▼] or [Merge▼]
   ☑ Messages         [Merge▼]   (default)
   ☑ Context Items    [Merge▼]   (default)
   ☑ Preferences      [Replace▼]
→ Click "Import Selected"
```

**Example scenarios:**

| Scenario | Checks | Modes |
|----------|--------|-------|
| Load entire session | All checked | Mix of Replace/Merge |
| Add messages only | Messages ✓ | Merge |
| Use different workflow | Uncheck Workflow | - |
| Backup/restore | All except Messages | Replace |

---

### Save/Load Workflow Profiles

**Save current workflow as profile:**
```
WorkflowDesigner → Profile dropdown → "Save Current as Profile"
→ Name it (e.g., "Analysis Mode")
→ Add tags (optional, e.g., "technical")
→ Click "Save Profile"
```

**Load a profile:**
```
WorkflowDesigner → Profile dropdown
→ Click desired profile (e.g., "Analysis Mode")
→ Workflow updates instantly
→ Make further edits if needed
→ Click "Save & Close" to apply
```

**Delete a profile:**
```
WorkflowDesigner → Profile dropdown
→ Hover over profile → Click trash icon
→ Confirm deletion
```

**List all profiles:**
```
WorkflowDesigner → Profile dropdown
→ Shows all saved profiles sorted by date
→ Current profile highlighted
```

---

## 📋 New Components

### 1. SessionImportModal
**File:** `components/SessionImportModal.tsx`

Appears when you click "Restore" on a workspace.

**Props:**
- `isOpen: boolean` - Modal visibility
- `onClose: () => void` - Close handler
- `onImport: (options, modes) => Promise<void>` - Import handler
- `isLoading?: boolean` - Show loading state

**Features:**
- 5 import option checkboxes
- Merge/Replace toggle per option
- Select All / Select None buttons
- Item counter
- Help text for each option

---

### 2. ProfileSelector
**File:** `components/ProfileSelector.tsx`

Dropdown in WorkflowDesigner header for profile management.

**Props:**
- `currentProfileId?: string` - Highlight current profile
- `onProfileLoad: (profile) => void` - Handle profile selection
- `onProfileSave: (name, tags?) => Promise<void>` - Handle save
- `isLoading?: boolean` - Disable during load

**Features:**
- Dropdown list of all profiles
- Delete button per profile
- Save current workflow button
- Tags display
- Updated date display
- Refresh button

---

### 3. WorkflowProfileManager (Service)
**File:** `services/workflowProfileManager.ts`

Manages profile persistence in IndexedDB.

**Key methods:**
```typescript
// Save a new profile
saveProfile(name, workflow, providers, description?, tags?)

// Load a profile
getProfile(id)

// List all profiles (with optional tag filter)
listProfiles(tags?)

// Update existing profile
updateProfile(id, name?, workflow?, providers?, ...)

// Delete a profile
deleteProfile(id)

// Export as JSON
exportProfile(id)

// Import from JSON
importProfile(jsonString)
```

---

## 🔗 Integration Points

**App.tsx:**
- Passes `createWorkspaceWithState` to ChatPanel
- Passes `loadWorkspaceWithOptions` to ChatPanel

**ChatPanel.tsx (ContextManager):**
- Renders `SessionImportModal` when loading workspace
- Calls `onLoadWorkspaceWithOptions` with import options

**WorkflowDesigner.tsx:**
- Renders `ProfileSelector` in header
- Has `handleLoadProfile` to update workflow
- Has `handleSaveProfile` to create new profile

**useChat.ts:**
- `createWorkspaceWithState()` - Export with full state
- `loadWorkspaceWithOptions()` - Import with selective restore

---

## 💾 Data Storage

**Profiles:**
- **Where:** IndexedDB (`reflex-workflow-db`)
- **What:** Workflow stages + provider settings
- **Persists:** Across browser sessions
- **Expires:** Never (until manually deleted)

**Workspaces:**
- **Where:** IndexedDB (`reflex-context-tiers-v1`, workspaces store)
- **What:** Messages, files, workflow, settings, preferences
- **Persists:** Across browser sessions
- **Expires:** Never (until manually deleted)

---

## ⚡ Performance Notes

- All operations are async (non-blocking UI)
- Profiles lazy-load only when modal opens
- Deduplication prevents duplicate messages on merge
- No file size limitations (IndexedDB quota ~50MB)

---

## 🐛 Troubleshooting

**Profile not appearing in dropdown?**
- Click "Refresh" button in profile dropdown
- Check browser console for errors
- Ensure you clicked "Save & Close" in WorkflowDesigner

**Workflow didn't update after loading profile?**
- Load profile → workflow updates locally
- Must click "Save & Close" to apply permanently
- Check WorkflowDesigner title bar for unsaved indicator

**Messages not imported?**
- Workspace must have message UUIDs in `itemIds`
- Check "Messages" is checked in import modal
- Set import mode to "Merge" to add without clearing

**Profile export/import?**
- Export available via `workflowProfileManager.exportProfile(id)`
- Returns JSON string
- Import via `workflowProfileManager.importProfile(jsonString)`

---

## 🎓 Examples

### Example 1: Team Setup Sharing
```
Alice creates "Research Mode" profile in her session
Alice: workflowProfileManager.exportProfile(profileId)
→ Saves JSON file locally

Bob: workflowProfileManager.importProfile(jsonContent)
→ Bob now has Alice's Research Mode profile
→ Can load instantly from dropdown
```

### Example 2: Session Preservation
```
You're mid-conversation with Analysis Mode workflow
Before closing:
→ Context Manager → Save Workspace
→ Full state saved (messages, files, workflow, settings)

Next day:
→ Context Manager → Load Workspace → Import Modal
→ Import "Workflow" (Replace) to get your analysis setup
→ Import "Messages" (Merge) to continue conversation
→ Done - workflow + history fully restored
```

### Example 3: Quick Mode Switch
```
Working in "Creative Mode"
Mid-thought: "Actually, let me switch to Analysis Mode"

→ WorkflowDesigner (Gear icon)
→ Profile dropdown → Select "Analysis Mode"
→ Workflow updates instantly
→ Save & Close
→ Continue chat with new cognitive setup
```

---

## 📝 API Reference

### useChat Hook Returns

**New methods:**
```typescript
chat.createWorkspaceWithState(
  name: string,
  description?: string,
  includeWorkflow?: boolean,
  includeSettings?: boolean,
  includePreferences?: boolean
) → Promise<string>  // Returns workspace ID

chat.loadWorkspaceWithOptions(
  id: string,
  options: {
    workflow?: boolean,
    aiSettings?: boolean,
    messages?: boolean,
    contextItems?: boolean,
    preferences?: boolean
  },
  modes: {
    workflow?: 'replace' | 'merge',
    aiSettings?: 'replace' | 'merge',
    messages?: 'replace' | 'merge',
    contextItems?: 'replace' | 'merge',
    preferences?: 'replace' | 'merge'
  }
) → Promise<void>
```

---

## ✅ Checklist: Getting Started

- [ ] Open WorkflowDesigner
- [ ] Create a profile: "My First Profile"
- [ ] Close WorkflowDesigner
- [ ] Save workspace: "My First Session"
- [ ] Create a test workspace with messages
- [ ] Click "Restore" on test workspace
- [ ] Try checking/unchecking different options
- [ ] Set different merge/replace modes
- [ ] Click "Import Selected"
- [ ] Verify workflow and messages loaded correctly
- [ ] Switch profiles in WorkflowDesigner
- [ ] Confirm workflow updates instantly

---

## 🚨 Important Notes

⚠️ **Merge mode is additive:**
- Messages: Adds new messages (deduped by UUID)
- Context Files: Unions current + imported file IDs
- Workflow: Appends imported stages to existing

⚠️ **Replace mode is destructive:**
- Workflow: Clears all stages, loads imported
- Settings: Overwrites all provider configs
- Preferences: Overwrites narrative and RCB

**Recommendation:** Use "Merge" as default for messages/context, "Replace" for workflow/settings.

---

## 🎉 Summary

You can now:
- ✅ Export complete sessions with workflow
- ✅ Load selectively (pick what you need)
- ✅ Save workflow configurations as reusable profiles
- ✅ Swap profiles in seconds
- ✅ Merge or replace on import
- ✅ Never lose a good configuration

Happy swapping! 🚀
