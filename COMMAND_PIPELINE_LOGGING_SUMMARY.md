# Command Pipeline Diagnostic Logging - Implementation Summary

## What Was Done

We added comprehensive diagnostic logging to track why L2's search commands weren't executing. The logs instrument the entire command pipeline from initial detection through execution and result re-injection.

## The Problem We Were Debugging

L2 (Planner) was emitting commands like:
```
> **? search.brave planning workflow decision making**
```

But these commands weren't being executed. The command scanner was updated to normalize markdown formatting with the regex:
```
/^[\s*`#>_~|:*]+/
```

However, we needed visibility into whether the normalization was actually working and at what point the pipeline was failing.

## Solution: Comprehensive Logging

### Where Logging Was Added

#### 1. Command Detection Phase (`hooks/useChat.ts` lines ~1155-1170)
**Logs:** Every line in the stream, its raw and normalized versions, and whether it matches a command pattern.

```typescript
lines.forEach((line, idx) => {
    const cleaned = normalizeCommandLine(line);
    const isCmd = cleaned.startsWith('? ') || cleaned.startsWith('! ') || cleaned.startsWith('?srg') || cleaned.startsWith('?search');
    loggingService.log('DEBUG', `  Line ${idx}: RAW="${line.substring(0, 60)}" | CLEAN="${cleaned.substring(0, 60)}" | isCmd=${isCmd}`);
});
```

**Purpose:** Verify that the markdown stripping regex actually works on the incoming text.

#### 2. Command Found Phase (`hooks/useChat.ts` lines ~1175-1195)
**Logs:** Confirmation that a command was found, its position, raw vs normalized form, and whether it's on the last line.

```typescript
loggingService.log('INFO', `[${stage.name}] FOUND COMMAND at line ${cmdIndex} of ${lines.length}`);
loggingService.log('DEBUG', `[${stage.name}] Raw command line: "${rawCommandLine.substring(0, 100)}"`);
loggingService.log('DEBUG', `[${stage.name}] Normalized command line: "${commandLine.substring(0, 100)}"`);
loggingService.log('INFO', `[${stage.name}] ✅ Detected command: ${commandLine}`);
```

**Purpose:** Show the exact transformation from raw (with markdown) to normalized (without), proving the regex works.

#### 3. Stream Interruption Phase (`hooks/useChat.ts` lines ~1305-1310)
**Logs:** When a mid-stream command breaks the generation to re-feed results to the model.

```typescript
loggingService.log('INFO', `[${stage.name}] Breaking stream to re-feed model with command results`);
```

**Purpose:** Verify that commands not on the last line are caught during streaming.

#### 4. End-of-Stream Check Phase (`hooks/useChat.ts` lines ~1355-1360)
**Logs:** When we check for commands at the end of the stream.

```typescript
loggingService.log('DEBUG', `[${stage.name}] Stream ended. Checking for end-of-stream commands (streamBrokenByCommand=${streamBrokenByCommand})`);
loggingService.log('DEBUG', `[${stage.name}] Final check result: shouldContinue=${finalCheck.shouldContinue}`);
```

**Purpose:** Verify that end-of-line commands are caught when the stream finishes.

#### 5. Background Service Phase (`services/backgroundCognitionService.ts` lines ~543-575)
**Logs:** When the background cognition service processes commands, including raw/normalized versions and query extraction.

```typescript
console.log(`[BG SERVICE] executeAskCommand - RAW: "${raw.substring(0, 60)}" | CLEAN: "${cleaned.substring(0, 60)}"`);
console.log(`[BG SERVICE] Executing search - EXTRACTED QUERY: "${query.substring(0, 60)}"`);
console.log(`[BG SERVICE] After stripping quotes - FINAL QUERY: "${query.substring(0, 60)}"`);
```

**Purpose:** Mirror the chat pipeline's debugging for the autonomous background agent.

## How to Use the Logs

### Step 1: Trigger a Command
In the chat, ask L2 to do something that requires research:
- "Plan a web feature for me"
- "What's the best approach to build this?"
- "Research and summarize planning methodologies"

### Step 2: Open Browser Console
Press **F12** → **Console** tab

### Step 3: Watch the Logs
Look for entries prefixed with `[L2_PLANNER]`, `[L1_SUBCONSCIOUS]`, `[L3_VOICE]`, or `[BG SERVICE]`.

### Step 4: Trace the Command Path
Follow the logs from detection → normalization → execution → result:

```
[L2_PLANNER] Scanning 10 lines for commands
[L2_PLANNER]   Line 3: RAW="> **? search.brave**" | CLEAN="? search.brave" | isCmd=true
[L2_PLANNER] FOUND COMMAND at line 3
[L2_PLANNER] Raw command line: "> **? search.brave planning**"
[L2_PLANNER] Normalized command line: "? search.brave planning"
[L2_PLANNER] ✅ Detected command: ? search.brave planning
[L2_PLANNER] Executing web search: "planning"
[L2_PLANNER] Command result: 2847 chars
[L2_PLANNER] Breaking stream to re-feed model with command results
```

## What the Logs Reveal

### If normalization is working:
- Raw line shows markdown: `> **? search.brave xyz**`
- Cleaned line shows no markdown: `? search.brave xyz`
- ✅ The regex is working

### If normalization fails:
- Raw and cleaned are identical
- Cleaned still contains markdown characters
- ❌ The regex doesn't match the input pattern

### If command detection fails:
- No "FOUND COMMAND" message appears
- But "Scanning N lines" appears
- ❌ The normalized text doesn't start with `? `, `! `, `?srg`, or `?search`

### If command execution fails:
- "Detected command" appears
- But "Executing web search" doesn't
- ❌ Command parsing failed (wrong prefix, missing query, etc.)

### If search API fails:
- "Executing web search: xyz" appears
- But "Command result: 0 chars" appears
- ❌ The API didn't return results (check `searchapi.py` on port 8001)

## Key Insights This Reveals

1. **The model does emit commands**: If you see logs, the model successfully generated the command.
2. **The normalization regex works**: If you see RAW vs CLEAN, the markdown is being stripped.
3. **The detection logic works**: If you see "DETECTED COMMAND", the prefix matching works.
4. **The execution logic works**: If you see "Command result: N chars", the API responded.
5. **The re-injection logic works**: If you see "Breaking stream", the flow control works.

If all 5 are true but the search still doesn't work, the issue is in something after this logging (e.g., the result formatting or the model's ability to use the result).

## Files That Were Modified

1. **`hooks/useChat.ts`**
   - Added line-by-line scanning logs (lines ~1157-1170)
   - Added command detection logs (lines ~1175-1195)
   - Added stream interruption logs (existing, ~1305-1310)
   - Added end-of-stream check logs (lines ~1355-1360)

2. **`services/backgroundCognitionService.ts`**
   - Added command parsing logs (lines ~545-548)
   - Added search execution logs (lines ~570-580)

3. **Documentation**
   - `DIAGNOSTIC_LOGGING_ADDED.md` - Detailed logging reference
   - `DEBUGGING_GUIDE_COMMAND_PIPELINE.md` - Quick troubleshooting guide
   - This file - Implementation summary

## Testing Checklist

- [ ] Run the app
- [ ] Open browser console (F12)
- [ ] Ask L2 to plan/research something
- [ ] Verify "Scanning N lines" appears
- [ ] Verify line-by-line breakdown shows at least one line with `isCmd=true`
- [ ] Verify "FOUND COMMAND" appears
- [ ] Verify raw vs normalized command lines are shown
- [ ] Verify "✅ Detected command" appears
- [ ] Verify "Executing web search" appears with a query
- [ ] Verify "Command result" appears with > 0 chars
- [ ] Verify L2's output includes the search results

If all tests pass, the pipeline is working end-to-end.

## Interpretation of Results

### All Logs Appear → Everything Works
The command was detected, normalized, executed, and results were returned. L2 can now synthesize using the search results.

### Logs Stop at "Found Command" → Parsing Failed
The command detection worked, but extracting the query from the command failed. Check the command prefix matches one of: `search.brave`, `search.pw`, `search.both`, `srg.q`, `file.*`, `wo.*`, `bg.*`.

### Logs Stop at "Scanning" → Detection Failed
No command was detected in any line. Either the model didn't emit a command, or the normalized text doesn't match the command pattern. Check the RAW vs CLEAN output to see what the regex produced.

### No Logs Appear at All → Different Layer or No Command
Either L2 didn't emit a command, or a different layer (L1, L3) was active. Check the stage name in the logs.

## Next Steps

Run the system with these logs enabled and check which case applies. This will pinpoint exactly where the pipeline breaks, if it does.

The logs are designed to be comprehensive enough to diagnose any issue from raw input to result, while staying performance-conscious by only logging at DEBUG and INFO levels.
