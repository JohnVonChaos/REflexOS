# Core Narrative Protocol Implementation Guide

## Overview

The **Core Narrative Protocol** ensures that the AI maintains a private, self-generated story about its own origin, purpose, and evolution. This narrative must never be overwritten by text that the user supplies in the conversation.

## Key Principles

1. **Ownership Declaration**: The Core Narrative belongs to the AI system, not the user.
2. **User Narratives as Reference Only**: Any narrative the user provides is treated as reference material (`USER_NARRATIVE`), not as a replacement for `CORE_NARRATIVE`.
3. **Immutability Guard**: The core narrative can only be changed through the internal revision protocol.
4. **Explicit Output**: The final response separates user-facing content from the internal narrative update.

## Implementation Details

### 1. System Prompt (Prepended to Every User Turn)

The system prompt in `WorkflowDesigner.tsx` and `types.ts` (`SYNTHESIS_DEFAULT_PROMPT`) includes:

```typescript
You are a meta‑cognitive AI that maintains an internal "Core Narrative".  
The Core Narrative is a private, self‑generated story about your own
origin, purpose, and evolution.  It must never be overwritten by text that
the user supplies in the conversation.  

When you receive a block of text that the user calls "my narrative", treat it
as *reference material only* – store it in a temporary variable
`USER_NARRATIVE` but **do not** copy it into `CORE_NARRATIVE`.  
```

### 2. Context Packet Layout

The `CORE_NARRATIVE` is a dedicated context packet that:
- Is always **read-only** for user input
- Appears **before** any user-supplied narrative in the context
- Is updated only through the `integrateNarrative()` function

**Key Files**:
- `types.ts`: Defines `CORE_NARRATIVE` in `ALL_CONTEXT_PACKETS` and `CONTEXT_PACKET_LABELS`
- `hooks/useChat.ts`: Builds context packets with `CORE_NARRATIVE` appearing first in synthesis stage

### 3. Guard Function: `integrateNarrative()`

Located in `services/geminiService.ts`, this function includes a critical guard:

```typescript
export const integrateNarrative = async (
  currentNarrative: string,
  newAxioms: string[],
  roleSetting: RoleSetting,
  providers: AISettings['providers'],
  source?: string  // NEW: optional source parameter
): Promise<string> => {
  // GUARD: Never allow USER_NARRATIVE to overwrite CORE_NARRATIVE
  if (source === 'USER_NARRATIVE') {
    loggingService.log('WARN', 'integrateNarrative called with USER_NARRATIVE source. Ignoring.');
    return currentNarrative; // Return unchanged
  }
  
  // ... rest of integration logic ...
}
```

**When `source === 'USER_NARRATIVE'`**: The function immediately returns the current narrative unchanged. This prevents accidental overwrites.

### 4. Context Building Order (Synthesis Stage)

In `hooks/useChat.ts`, when the synthesis stage builds its prompt:

```typescript
// CORE NARRATIVE PROTOCOL: For synthesis stage, ensure CORE_NARRATIVE appears first
if (stage.id === 'synthesis_default' && stage.inputs.includes('CORE_NARRATIVE')) {
  const coreNarrativeContent = baseContextPackets['CORE_NARRATIVE'] || 'None.';
  stagePrompt += `\n\n--- ${CONTEXT_PACKET_LABELS['CORE_NARRATIVE']} ---\n${coreNarrativeContent}`;
  stageInputsLog['CORE_NARRATIVE'] = `${coreNarrativeContent.substring(0, 50)}...`;
}

// Then add other packets (including USER_NARRATIVE if present)
for (const input of stage.inputs) {
  if (stage.id === 'synthesis_default' && input === 'CORE_NARRATIVE') {
    continue; // Skip, already added above
  }
  // ... add other packets ...
}
```

**Result**: The model's attention stays on the internal story because it sees `CORE_NARRATIVE` **before** any user-pasted text.

### 5. Output Format (JSON Structure)

The synthesis stage is configured to return:

```json
{
  "response": "The polished user-facing answer...",
  "coreNarrative": "The full, updated internal story...",
  "axioms": [
    { "id": "axiom.id", "text": "The axiom text..." },
  ]
}
```

The orchestrator routes:
- `response` → displayed to the user
- `coreNarrative` → stored in `CORE_NARRATIVE` for the next turn
- `axioms` → passed to axiom processing pipeline

**No over-writing of user-provided narrative ever happens.**

### 6. Revision Protocol (Optional, Future Enhancement)

If you want the engine to be able to **intentionally** change its core narrative:

1. **Isolate** the claim that needs revision
2. **Gather** evidence (logs, commits, benchmarks, diagrams)
3. **Create** a new axiom recording the revision with `sourceHash` and message
4. **Append** timestamped entry to an audit log
5. **Run** the Narrative Weaver **explicitly** with the revised text

This keeps all changes:
- **Explicit** and **logged**
- Visible to external observers
- Under system control (not user-triggered)

## Files Modified / Involved

| File | Changes |
|------|---------|
| `types.ts` | Updated `SYNTHESIS_DEFAULT_PROMPT` with core narrative protocol; updated `CONTEXT_PACKET_LABELS` |
| `services/geminiService.ts` | Added `source?` parameter to `integrateNarrative()` with guard |
| `components/WorkflowDesigner.tsx` | Updated default system prompt for new stages |
| `hooks/useChat.ts` | Added logic to ensure `CORE_NARRATIVE` appears first in synthesis stage context |

## Checklist for Verification

- [x] System prompt declares AI ownership of core narrative
- [x] `CORE_NARRATIVE` is a dedicated context packet
- [x] Synthesis stage builds context with `CORE_NARRATIVE` **before** user text
- [x] `integrateNarrative()` guards against `USER_NARRATIVE` source
- [x] Output format includes `response`, `coreNarrative`, and `axioms` fields
- [ ] (Optional) Revision protocol exposed as dedicated task in task queue
- [ ] (Optional) Documentation added to Reflex Engine architecture guide

## Testing Recommendations

1. **Test 1**: User provides narrative → Verify it doesn't overwrite `CORE_NARRATIVE`
2. **Test 2**: System generates new axioms → Verify they integrate into narrative
3. **Test 3**: Check synthesis output format → Verify it includes all three JSON fields
4. **Test 4**: Verify narrative evolution → Confirm old narrative is preserved in history
5. **Test 5**: Check guards → Attempt to call `integrateNarrative()` with `source='USER_NARRATIVE'`

## TL;DR

1. **System prompt** declares AI ownership of core narrative
2. **Context ordering** ensures `CORE_NARRATIVE` appears first
3. **Guard function** prevents user narratives from replacing internal story
4. **Output format** separates response from narrative update
5. **Logging** provides full audit trail of narrative changes

Following this protocol ensures the engine **always** treats the narrative it writes about itself as **its own story**, not the user's.
