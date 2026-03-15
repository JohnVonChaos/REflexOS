# Visual Reference - Command Pipeline Logging Points

## The Logging Points Visualized

```
┌─────────────────────────────────────────────────────────────────┐
│  Model (L2_PLANNER) Generates Text with Command                │
│  "> **? search.brave planning workflow**"                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 📍 LOGGING POINT 1: SCANNING                                   │
│ "Scanning 10 lines for commands (isStreamEnd=false)"           │
│                                                                 │
│ Line breakdown:                                                 │
│   Line 0: RAW="..." | CLEAN="..." | isCmd=false               │
│   Line 3: RAW="> **? search.brave**" | CLEAN="? search..." | isCmd=true  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 📍 LOGGING POINT 2: DETECTION                                  │
│ "FOUND COMMAND at line 3 of 10"                               │
│ "Command position: isLastLine=false, isStreamEnd=false"       │
│                                                                 │
│ Raw: "> **? search.brave planning workflow**"                 │
│ Normalized: "? search.brave planning workflow"                │
│ ✅ Detected command: ? search.brave planning workflow         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Is command on   │
                    │ last line?      │
                    └────┬──────────┬──┘
              YES, it's mid-stream │     NO, it's at end
                        ▼          │              ▼
          ┌──────────────────┐    │   ┌──────────────────┐
          │ 📍 LOGGING POINT 3A:  │   │ 📍 LOGGING POINT 3B: │
          │ STREAM INTERRUPTION   │   │ END-OF-STREAM      │
          │ "Breaking stream to   │   │ "Stream ended.     │
          │ re-feed model with    │   │ Checking for       │
          │ command results"      │   │ end-of-stream      │
          │                       │   │ commands"          │
          │ ↓ Executes immediately  │   │ ↓ Waits for stream  │
          └───────┬────────────────┘   │   └──────────┬───────┘
                  │                    │              │
                  └────────────┬────────┘              │
                               ▼                      │
                   ┌──────────────────────┐            │
                   │ Parse command & query │            │
                   │ Extract from text     │            │
                   └────┬─────────────────┘            │
                        │                              │
                        ▼                              │
        ┌──────────────────────────────────┐           │
        │ 📍 LOGGING POINT 4: EXECUTION    │           │
        │ "Executing web search: {query}"  │           │
        │ "Command result: XXXX chars"     │           │
        └────┬───────────────────────────┬─┘           │
             │                           │              │
    API Success          API Failure      │              │
             │                           │              │
             ▼                           ▼              │
    ┌─────────────────┐      ┌──────────────────┐     │
    │ Return results  │      │ Return error msg │     │
    │ to stream       │      │ to stream        │     │
    └────┬────────────┘      └────┬─────────────┘     │
         │                        │                    │
         └────────────┬───────────┘                    │
                      ▼                                │
       ┌────────────────────────────┐                 │
       │ Re-inject back into stream │                 │
       │ Model continues synthesis  │◄────────────────┘
       │ with search context        │
       └────────────────────────────┘
                      │
                      ▼
       ┌─────────────────────────────────┐
       │ L2's Final Output Includes      │
       │ [WEB SEARCH RESULTS]            │
       │ ... actual results ...          │
       │ [SOURCES]                       │
       │ ... URLs ...                    │
       └─────────────────────────────────┘
```

## Logging Point Reference Table

| # | Name | File | Line | When | Input | Output |
|---|------|------|------|------|-------|--------|
| 1 | Scanning | useChat.ts | ~1157 | Each stream chunk | Text lines | "Scanning N lines" + line breakdown |
| 2 | Detection | useChat.ts | ~1175 | When command found | Normalized text | "FOUND COMMAND at line X" + raw/clean |
| 3A | Interruption | useChat.ts | ~1305 | Mid-stream command | Stream data | "Breaking stream to re-feed" |
| 3B | End-of-Stream | useChat.ts | ~1355 | After stream ends | Final text | "Stream ended. Checking for..." |
| 4 | Execution | useChat.ts | ~1245 | Command execution | Command text | "Executing web search" + "Command result" |
| BG | Background | backgroundCognitionService.ts | ~545 | BG command parsing | Command line | "RAW vs CLEAN" + "EXTRACTED QUERY" |

## Example Console Output

When everything works:

```
DEBUG [L2_PLANNER] Scanning 8 lines for commands (isStreamEnd=false)
DEBUG [L2_PLANNER]   Line 0: RAW="Let me analyze this..." | CLEAN="Let me analyze this..." | isCmd=false
DEBUG [L2_PLANNER]   Line 1: RAW="First, I need..." | CLEAN="First, I need..." | isCmd=false
DEBUG [L2_PLANNER]   Line 3: RAW="> **? search.brave best practices**" | CLEAN="? search.brave best practices" | isCmd=true
DEBUG [L2_PLANNER]   Line 4: RAW="Then I'll synthesize..." | CLEAN="Then I'll synthesize..." | isCmd=false

INFO [L2_PLANNER] FOUND COMMAND at line 3 of 8
DEBUG [L2_PLANNER] Command position: isLastLine=false, isStreamEnd=false
DEBUG [L2_PLANNER] Raw command line: "> **? search.brave best practices for planning**"
DEBUG [L2_PLANNER] Normalized command line: "? search.brave best practices for planning"
INFO [L2_PLANNER] ✅ Detected command: ? search.brave best practices for planning

INFO [L2_PLANNER] Executing web search: "best practices for planning"
INFO [L2_PLANNER] Command result: 3124 chars

INFO [L2_PLANNER] Breaking stream to re-feed model with command results

[Stream is broken, results are re-injected, L2 continues...]

DEBUG [L2_PLANNER] Stream ended. Checking for end-of-stream commands (streamBrokenByCommand=true)
DEBUG [L2_PLANNER] Final check result: shouldContinue=false
```

## Failure Mode Examples

### Scenario 1: Command Not Detected
```
DEBUG [L2_PLANNER] Scanning 5 lines for commands (isStreamEnd=false)
DEBUG [L2_PLANNER]   Line 0: RAW="..." | CLEAN="..." | isCmd=false
DEBUG [L2_PLANNER]   Line 1: RAW="..." | CLEAN="..." | isCmd=false
DEBUG [L2_PLANNER]   Line 2: RAW="..." | CLEAN="..." | isCmd=false

[No "FOUND COMMAND" message]
```
**Problem:** The command wasn't detected. Either L2 didn't emit one, or normalization failed.

### Scenario 2: Normalization Failed
```
DEBUG [L2_PLANNER]   Line 3: RAW="> **? search.brave xyz**" | CLEAN="> **? search.brave xyz**" | isCmd=false
```
**Problem:** Raw and CLEAN are identical - the regex didn't strip the markdown.

### Scenario 3: Query Extraction Failed
```
INFO [L2_PLANNER] ✅ Detected command: ? search.brave
INFO [L2_PLANNER] Executing web search: ""
INFO [L2_PLANNER] Command result: 0 chars
```
**Problem:** The query after `search.brave` was empty.

### Scenario 4: API Failed
```
INFO [L2_PLANNER] Executing web search: "best practices"
INFO [L2_PLANNER] Command result: 0 chars
```
**Problem:** The API returned no results. Check if `searchapi.py` is running.

## Color-Coded Log Levels

When reading logs, pay attention to the level:

- 🔵 **DEBUG** - Detailed info (line-by-line breakdown, intermediate values)
- 🟢 **INFO** - Important steps (command found, execution started, results returned)
- 🟠 **WARNING** - Something unexpected (usually not seen in success case)
- 🔴 **ERROR** - Something failed (command execution error, API failure)

Most important messages are at **INFO** level with checkmarks: ✅

## Quick Reference - What Each Log Proves

| Log | Proves |
|-----|--------|
| "Scanning N lines" | The stream has content |
| "isCmd=true" | The regex found a command pattern |
| "FOUND COMMAND" | A complete command was detected |
| "Raw: X" "Normalized: Y" (different) | Markdown stripping works |
| "✅ Detected" | Command format is valid |
| "Executing web search" | Query extraction works, API about to be called |
| "Command result: N>0 chars" | API responded with data |
| "Breaking stream" | Stream interruption works, result re-injection works |

If all 8 appear, the entire pipeline works.

## Adding New Logging

If you need to add more logging:

1. Use `loggingService.log('DEBUG', 'message')` in chat pipeline
2. Use `console.log('message')` in background service
3. Include stage name: `[${stage.name}]`
4. Keep messages concise
5. Use checkmarks (✅) for confirmations
6. Use descriptive variable names in quotes

Example:
```typescript
loggingService.log('DEBUG', `[${stage.name}] Processing: ${variable.substring(0, 50)}`);
```

## Related Documentation

- `DIAGNOSTIC_LOGGING_ADDED.md` - Detailed reference of each logging point
- `DEBUGGING_GUIDE_COMMAND_PIPELINE.md` - Troubleshooting guide
- `END_TO_END_VERIFICATION.md` - Complete testing checklist
- `COMMAND_PIPELINE_LOGGING_SUMMARY.md` - Implementation details
