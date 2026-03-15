# Diagnostic Logging Added to Command Pipeline

## Overview
Comprehensive diagnostic logging has been added to track command detection, normalization, and execution throughout the web search pipeline. This allows us to see exactly what's happening at each stage when the model emits commands.

## Locations & What Each Logs

### 1. `hooks/useChat.ts` - Main Chat Pipeline (Lines ~1155-1200, 1355-1360)

#### Scanning Phase Logging
```typescript
loggingService.log('DEBUG', `[${stage.name}] Scanning ${lines.length} lines for commands (isStreamEnd=${isStreamEnd})`);
lines.forEach((line, idx) => {
    const cleaned = normalizeCommandLine(line);
    const isCmd = cleaned.startsWith('? ') || cleaned.startsWith('! ') || cleaned.startsWith('?srg') || cleaned.startsWith('?search');
    if (cleaned || isCmd) {
        loggingService.log('DEBUG', `  Line ${idx}: RAW="${line.substring(0, 60)}" | CLEAN="${cleaned.substring(0, 60)}" | isCmd=${isCmd}`);
    }
});
```

**What it shows:**
- Number of lines in the streamed text
- For each line: the raw text, the normalized text (after markdown stripping), and whether it matched a command pattern
- Whether we're at the end of the stream

#### Detection & Normalization Logging
```typescript
loggingService.log('INFO', `[${stage.name}] FOUND COMMAND at line ${cmdIndex} of ${lines.length}`);
loggingService.log('DEBUG', `[${stage.name}] Command position: isLastLine=${isLastLine}, isStreamEnd=${isStreamEnd}`);
loggingService.log('DEBUG', `[${stage.name}] Raw command line: "${rawCommandLine.substring(0, 100)}"`);
loggingService.log('DEBUG', `[${stage.name}] Normalized command line: "${commandLine.substring(0, 100)}"`);
loggingService.log('INFO', `[${stage.name}] ✅ Detected command: ${commandLine}`);
```

**What it shows:**
- Which line number contains the command
- Whether the command is on the last line (important for waiting logic)
- The full raw line before normalization
- The normalized line after markdown stripping
- Confirmation that a valid command was detected

#### Stream Interruption Logging
```typescript
loggingService.log('INFO', `[${stage.name}] Breaking stream to re-feed model with command results`);
```

**What it shows:**
- When a command interrupts the stream mid-generation
- This happens if command is not on the last line (meaning there's more text coming)

#### End-of-Stream Check Logging
```typescript
loggingService.log('DEBUG', `[${stage.name}] Stream ended. Checking for end-of-stream commands (streamBrokenByCommand=${streamBrokenByCommand})`);
loggingService.log('DEBUG', `[${stage.name}] Final check result: shouldContinue=${finalCheck.shouldContinue}`);
```

**What it shows:**
- Whether we're running the final check after stream ends
- Whether a command was already executed during streaming
- Result of the end-of-stream command check

#### Execution Logging (existing)
```typescript
loggingService.log('INFO', `[${stage.name}] Executing web search: "${query}"`);
loggingService.log('INFO', `[${stage.name}] Command result: ${commandResult.length} chars`);
```

### 2. `services/backgroundCognitionService.ts` - Background Agent Pipeline (Lines ~543+)

#### Command Parsing Logging
```typescript
console.log(`[BG SERVICE] executeAskCommand - RAW: "${raw.substring(0, 60)}" | CLEAN: "${cleaned.substring(0, 60)}"`);
console.log(`[BG SERVICE] Extracted cmd: "${cmd.substring(0, 60)}"`);
```

**What it shows:**
- Raw vs. normalized versions of the command line from the background agent
- The extracted command part (everything after `?` or `!`)

#### Search Execution Logging
```typescript
console.log(`[BG SERVICE] Executing search - EXTRACTED QUERY: "${query.substring(0, 60)}"`);
console.log(`[BG SERVICE] After stripping quotes - FINAL QUERY: "${query.substring(0, 60)}"`);
console.log(`[BG SERVICE] ERROR: Query is empty after parsing`);
console.log(`[BG SERVICE] Search completed - ${results ? results.text.length : 0} chars returned`);
```

**What it shows:**
- The query extracted from the search command (before quote stripping)
- The final query after all processing
- Whether the query was empty (which would cause an error)
- How many characters of results were returned

## How to Use This Logging

### In VS Code
The logging outputs go to the browser console (F12 → Console tab). You'll see entries with prefixes:
- `[L1_SUBCONSCIOUS]` - Subconscious layer output
- `[L2_PLANNER]` - Planner layer output
- `[L3_VOICE]` - Voice layer output
- `[BG SERVICE]` - Background cognition service

### Example Trace for L2 Search Command
When L2 emits `? search.brave planning workflow decision making`, you should see:

```
DEBUG [L2_PLANNER] Scanning 5 lines for commands (isStreamEnd=false)
DEBUG [L2_PLANNER]   Line 0: RAW="Some analysis text" | CLEAN="Some analysis text" | isCmd=false
DEBUG [L2_PLANNER]   Line 1: RAW="> **? search.brave planning**" | CLEAN="? search.brave planning" | isCmd=true
INFO [L2_PLANNER] FOUND COMMAND at line 1 of 5
DEBUG [L2_PLANNER] Command position: isLastLine=false, isStreamEnd=false
DEBUG [L2_PLANNER] Raw command line: "> **? search.brave planning workflow decision making**"
DEBUG [L2_PLANNER] Normalized command line: "? search.brave planning workflow decision making"
INFO [L2_PLANNER] ✅ Detected command: ? search.brave planning workflow decision making
INFO [L2_PLANNER] Executing web search: "planning workflow decision making"
INFO [L2_PLANNER] Command result: 2847 chars
```

### What Each Log Entry Means

1. **"Scanning N lines"** - The stream buffer contains N lines
2. **Line breakdown** - Each line shows raw text, cleaned text, and whether it's a command
3. **"FOUND COMMAND at line X"** - A command was detected on line X
4. **"Command position"** - Is it the last line? Is the stream finished?
5. **"Normalized command line"** - This is what the regex produced after stripping markdown
6. **"✅ Detected command"** - This is the cleaned-up command text that will be parsed
7. **"Executing web search"** - The search query that will go to the API
8. **"Command result"** - How many characters of response came back

## Troubleshooting with This Logging

### If command doesn't execute:
1. Check if "FOUND COMMAND" appears - if not, the command wasn't detected
2. Check the "Normalized command line" - is the markdown properly stripped?
3. Check if "Executing web search" appears - if not, the command parsing failed
4. Check "Command result" - did the API return data?

### If command is detected but waits:
1. Look for "Command position: isLastLine=true, isStreamEnd=false"
2. This means the model put the command at the end but more text is still streaming
3. Once the stream finishes, you should see "Stream ended. Checking for end-of-stream commands"

### If command appears in the output:
1. Check if the command should have been removed by "Breaking stream to re-feed model"
2. If not, the stream wasn't broken and the command appeared as literal text

## Key Diagnostic Points

The normalization regex being used:
```typescript
const normalizeCommandLine = (line: string) => line.replace(/^[\s*`#>_~|:*]+/, '').trim();
```

This strips these characters from the beginning of a line:
- Whitespace (`\s`)
- Asterisks (`*`) for bold
- Backticks (`` ` ``) for code
- Hash (`#`) for headings
- Greater-than (`>`) for blockquotes
- Underscores (`_`) for italics
- Tildes (`~`) for strikethrough
- Pipes (`|`) for tables
- Colons (`:`) for emoji

If the normalized line doesn't look right, the regex may need adjustment.

## Implementation Notes

- Chat pipeline uses `loggingService.log()` which goes to persistent logs
- Background service uses `console.log()` for immediate browser console visibility
- DEBUG level logs are only shown in detailed debugging contexts
- INFO level logs are always visible
- ERROR level logs highlight problems

## Files Modified

1. `hooks/useChat.ts` (lines ~1155-1360)
2. `services/backgroundCognitionService.ts` (lines ~543-575)

Both files now have comprehensive diagnostic logging that tracks the entire command pipeline.
