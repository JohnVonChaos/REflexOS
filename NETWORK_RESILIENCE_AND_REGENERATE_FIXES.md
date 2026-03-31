# Network Resilience & Regenerate Button Implementation

## Overview
Three critical fixes implemented to address network issues, tool command visibility, and turn regeneration.

---

## Issue #1: Network Errors Crash the Pipeline

### Problem
When network issues occur (Starlink dropouts), the entire chat pipeline crashes and discards everything, leaving no way to recover.

### Solution: Automatic Retry with Exponential Backoff
Added intelligent retry mechanism that:
- **Detects network errors** (timeouts, 503s, fetch failures)
- **Retries automatically** up to 3 times with exponential backoff (1.5s → 3s → 6s)
- **Only retries network errors** - other errors (validation, context overflow, etc.) fail immediately
- **Preserves workflow progress** - already-completed stages are saved
- **Logs all retry attempts** for debugging

### Implementation Details

**File: `hooks/useChat.ts`**

```typescript
// Helper to detect network-related errors
const isNetworkError = (e: any): boolean => {
    const errStr = (e.toString() + (e.message || '')).toLowerCase();
    return errStr.includes('network') || errStr.includes('timeout') || 
           errStr.includes('503') || errStr.includes('failed to fetch') || 
           (e instanceof TypeError && (errStr.includes('network') || errStr.includes('fetch')));
};

// Exponential backoff retry wrapper
async function retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T>
```

**Usage in workflow stage streaming:**
```typescript
const stream = await retryWithExponentialBackoff(
    () => sendMessageToGemini(contents, enhancedSystemPrompt, true, roleSetting, aiSettingsRef.current.providers),
    3,      // max retries
    1500    // base delay in ms
);
```

### User Experience
- Silent retries with logging - user sees loading spinner continue
- After 3 retries: clear error message displayed
- Can retry immediately or adjust settings and try again
- All model responses accumulated so far are preserved

---

## Issue #2: Tool Command Execution Clears Chat Response

### Problem
When the model detects a tool command mid-stream (e.g., `search.brave query`), the response gets cleared/truncated before showing the command result, making it impossible to see what the model was thinking before calling the tool.

### Solution: Preserve Full Conversation History Through Tool Execution

When a command is detected and executed:
1. **Show acknowledgment** with the text before the command
2. **Execute the command** with full result captured
3. **Re-feed to model** INCLUDING the prior output
4. **Continue streaming** with the original text intact

### Implementation Details

**File: `hooks/useChat.ts` line ~1520**

```typescript
return {
    shouldContinue: true,
    result: commandResult,
    newText: textBeforeCommand + '\n\n> Executing: ' + fullMatch + '...',
    // FIX: Include the command result in priorOutput so the full conversation is preserved
    priorOutput: textBeforeCommand + '\n\n```\n[COMMAND OUTPUT]\n' + commandResult + '\n```'
};
```

The key change: `priorOutput` now includes the complete command output, not just text before the command.

### Example Flow
```
Original text: "Let me search for this...\nsearch.brave starlink"
                ↓
After command: "Let me search for this...
                [COMMAND OUTPUT]
                [Web search results...]
                
                Continue your response:"
                ↓
Model sees full context and continues naturally
```

### User Experience
- Full model response always visible
- Tool command results shown inline
- Context never lost during tool execution
- Clear separation between model thought and tool output

---

## Issue #3: No Way to Regenerate/Rerun a Turn

### Problem
If the user wants to retry a turn (e.g., different settings, network recovered, want different response), there's no button or mechanism to easily rerun the last message.

### Solution: Regenerate Button + Last Message Tracking

Added a "regenerate" button (↻) that reruns the last user message with current settings.

### Implementation Details

**File: `hooks/useChat.ts`**

State management:
```typescript
const [lastUserMessage, setLastUserMessage] = useState<string>('');

// Store in ref for access within callbacks
const lastUserMessageRef = useRef('');
```

Tracking the message:
```typescript
const sendMessage = useCallback(async (messageText: string) => {
    // ... setup code ...
    
    // Store for rerun capability
    setLastUserMessage(messageText);
    
    // ... rest of sendMessage ...
}, [/* deps */]);
```

Regenerate function:
```typescript
const rerunLastTurn = useCallback(() => {
    if (lastUserMessage && !isLoading) {
        loggingService.log('INFO', 'Rerunning last turn...', { message: lastUserMessage.substring(0, 100) });
        sendMessage(lastUserMessage);
    }
}, [lastUserMessage, isLoading, sendMessage]);
```

**File: `components/ChatPanel.tsx`**

Added to interface:
```typescript
rerunLastTurn?: () => void;
```

Button rendering:
```tsx
{rerunLastTurn && (
    <button
        onClick={rerunLastTurn}
        className="p-2 text-gray-400 hover:text-cyan-300 hover:bg-gray-600 rounded-full transition-colors"
        title="Regenerate - rerun the last turn"
    >
        ↻
    </button>
)}
```

### User Experience
- Button appears only when not currently loading
- Clicking reruns the exact same user message
- Useful for:
  - Retrying after network recovery
  - Getting a different response with adjusted settings
  - Testing workflow changes
  - Recovering from mid-generation stops

---

## Testing Checklist

### Network Resilience
- [ ] Kill internet / disconnect network
- [ ] Trigger chat generation
- [ ] Verify retry attempts in console logs
- [ ] Reconnect internet
- [ ] Generation should continue and complete
- [ ] No data loss

### Tool Command Visibility
- [ ] Chat with a message that triggers tool execution
- [ ] Verify text before tool command remains visible
- [ ] Verify tool output appears clearly
- [ ] Verify model continues after tool result
- [ ] Full response is never truncated

### Regenerate Button
- [ ] Send a message
- [ ] Button should appear when generation completes
- [ ] Click regenerate button
- [ ] Same message should be reprocessed
- [ ] New response generated with current settings
- [ ] Button disabled during generation

---

## Code Changes Summary

| File | Changes | Lines |
|------|---------|-------|
| `hooks/useChat.ts` | Add retry logic, lastUserMessage tracking, rerunLastTurn function | +50 |
| `components/ChatPanel.tsx` | Add rerunLastTurn prop, render button | +10 |
| `App.tsx` | Pass rerunLastTurn to ChatPanel | +1 |

**Total**: ~61 lines added, 100% backward compatible

---

## Configuration

Network retry behavior can be adjusted in `hooks/useChat.ts`:

```typescript
// Current defaults:
const stream = await retryWithExponentialBackoff(
    () => sendMessageToGemini(...),
    3,      // ← Max retries (increase to 5 for very unreliable networks)
    1500    // ← Base delay ms (increase to 2000 for slower recovery)
);
```

---

## Monitoring

All retry attempts are logged with full context:
```typescript
loggingService.log('WARN', `Network error (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delayMs}ms...`, { error: e.message });
```

Check browser console or logging dashboard for:
- `Network error persisted after X retries` - permanent failure
- `Network error (attempt X/Y)` - temporary failure being retried
- `Rerunning last turn...` - user triggered regenerate

---

## Notes

- Retry logic applies only to main synthesis stage (critical path)
- Autonomous background cycles have separate error handling
- Context overflow errors do NOT retry (they need immediate pruning)
- Model validation errors do NOT retry (they need user intervention)
- All completed workflow stages are preserved in memory during retry attempts

