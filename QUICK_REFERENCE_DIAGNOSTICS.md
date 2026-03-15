# ⚡ Quick Reference - Command Pipeline Diagnostics

## 30-Second Summary

✅ Added logging to trace web search commands from detection through execution  
✅ 2 files modified: `useChat.ts` and `backgroundCognitionService.ts`  
✅ 8 documentation files created  
✅ TypeScript compiles with no errors  
✅ Ready to test  

## How to Test (60 seconds)

```
1. Open browser: F12 → Console
2. Ask L2: "Plan how to build a search feature"
3. Watch for: [L2_PLANNER] logs in console
4. Look for: "Scanning" → "FOUND COMMAND" → "Executing web search"
5. Success: L2 output includes "[WEB SEARCH RESULTS]"
```

## The 6 Logging Points

```
Raw Model Output (with markdown)
    ↓
[1] Scanning: Line by line breakdown (raw vs normalized)
    ↓
[2] Detection: Command found confirmation + raw/clean comparison
    ↓
[3] Interruption: Stream broken for result re-injection
    ↓
[4] Execution: Web search query + result count
    ↓
[5] End-of-Stream: Final check for commands
    ↓
[6] Background: BG service command parsing (if applicable)
    ↓
Results integrated into L2's synthesis
```

## Success Checklist (8 Items)

- [ ] "Scanning N lines for commands"
- [ ] At least one line shows "isCmd=true"
- [ ] "FOUND COMMAND at line X of N"
- [ ] Raw line has markdown, normalized doesn't
- [ ] "✅ Detected command:"
- [ ] "Executing web search: [query]"
- [ ] "Command result: [N>0] chars"
- [ ] "Breaking stream to re-feed"

**All 8 = Success! ✅**

## If Something Doesn't Work

| Problem | Check |
|---------|-------|
| No logs at all | Is L2 emitting a command? Try: "Research planning strategies" |
| "Scanning" but no "isCmd=true" | Normalization failed - check RAW vs CLEAN |
| "isCmd=true" but no "FOUND COMMAND" | Detection failed - command prefix wrong |
| "FOUND COMMAND" but no "Executing" | Parsing failed - query is empty or malformed |
| "Executing" but "Command result: 0" | API failed - check if searchapi.py is running |
| All logs appear but search doesn't work | Stream interruption issue - check if "Breaking stream" appears |

## The Magic Regex

```javascript
/^[\s*`#>_~|:*]+/
```

This strips these from the start of a line:
- Whitespace, asterisks (bold), backticks (code)
- Hashes (headers), `>` (blockquotes), underscores (italics)
- Tildes (strikethrough), pipes (tables), colons (emoji)

Transforms: `> **? search.brave xyz**` → `? search.brave xyz` ✅

## Files to Know About

### Code Files (Modified)
- `hooks/useChat.ts` - Chat pipeline logging (5 points)
- `services/backgroundCognitionService.ts` - BG service logging (2 points)

### Documentation Files (Start Here)
- `LOGGING_DOCUMENTATION_INDEX.md` - Navigation guide
- `END_TO_END_VERIFICATION.md` - Testing checklist
- `DEBUGGING_GUIDE_COMMAND_PIPELINE.md` - Troubleshooting
- `DIAGNOSTIC_LOGGING_COMPLETE.md` - Full overview

### Other Docs (Reference)
- `LOGGING_VISUAL_REFERENCE.md` - Flowchart & examples
- `DIAGNOSTIC_LOGGING_ADDED.md` - Technical details
- `CODE_CHANGES_LOGGING.md` - Exact code changes
- `DIAGNOSTIC_LOGGING_READY.md` - Status summary

## Console Filter Tips

```javascript
// In browser console, filter by:
[L2_PLANNER]     // See L2-specific logs
[L1_SUBCONSCIOUS] // See L1 logs
Scanning         // Find start of detection
FOUND COMMAND    // Find when command detected
Executing        // Find when search executes
Command result   // Find results returned
ERROR            // Find any errors
```

## Expected vs Actual

### ✅ What You Should See
```
INFO [L2_PLANNER] ✅ Detected command: ? search.brave xyz
INFO [L2_PLANNER] Executing web search: "xyz"
INFO [L2_PLANNER] Command result: 2847 chars
INFO [L2_PLANNER] Breaking stream to re-feed model with command results

[L2's response now includes "[WEB SEARCH RESULTS]" section]
```

### ❌ What Goes Wrong (And How to Spot It)
```
[If you don't see "Scanning"] → L2 didn't emit anything
[If no "isCmd=true"] → Normalization failed
[If no "FOUND COMMAND"] → Detection failed
[If no "Executing web search"] → Parsing failed
[If "Command result: 0"] → API didn't return data
[If no "Breaking stream"] → Stream interruption failed
```

## API Status

```
Port: 8001
Endpoint: POST /search
Test: curl http://localhost:8001/docs

If it fails: Run `python searchapi.py` manually
```

## Code Changes at a Glance

| File | Lines | Change |
|------|-------|--------|
| useChat.ts | 1157-1170 | Add scanning logs |
| useChat.ts | 1175-1195 | Add detection logs |
| useChat.ts | 1355-1360 | Add end-of-stream logs |
| backgroundCognitionService.ts | 545-550 | Add parsing logs |
| backgroundCognitionService.ts | 570-580 | Add search logs |

**Total:** ~42 lines of logging code added

## Compilation Status

```
✅ useChat.ts - No errors
✅ backgroundCognitionService.ts - No errors
✅ TypeScript compiles
✅ Ready to test
```

## Key Insight

The model doesn't need to be precise. It can wrap commands in:
- Blockquotes: `> ? search.brave xyz`
- Bold: `**? search.brave xyz**`
- Code: `` `? search.brave xyz` ``
- Combined: `> **? search.brave xyz**`

The logging shows exactly how the regex handles each format.

## The Philosophy

**Before:** Black box - we didn't know why commands weren't executing  
**After:** Full visibility - every step of the pipeline is logged  
**Result:** Deterministic debugging - logs point to the exact problem

## Success Indicators in Output

Look for these in L2's final response:

```
[WEB SEARCH RESULTS]
According to recent research...
[SOURCES]
https://example.com
https://example.com
```

If you see this, the entire pipeline worked! ✅

## Emergency Checklist

```
[ ] App runs without errors
[ ] F12 console opens
[ ] Ask L2 a research question
[ ] See [L2_PLANNER] logs
[ ] Follow logs to "Breaking stream"
[ ] L2's response includes "[WEB SEARCH RESULTS]"
```

All checked = System works! 🚀

## When to Read What

| Situation | Read This |
|-----------|-----------|
| "Just tell me if it works" | This file |
| "How do I test it?" | `END_TO_END_VERIFICATION.md` |
| "Something's broken, help!" | `DEBUGGING_GUIDE_COMMAND_PIPELINE.md` |
| "Show me the code changes" | `CODE_CHANGES_LOGGING.md` |
| "I want the full story" | `DIAGNOSTIC_LOGGING_COMPLETE.md` |
| "I'm a visual person" | `LOGGING_VISUAL_REFERENCE.md` |

## The Bottom Line

✅ Everything is instrumented  
✅ Everything compiles  
✅ Everything is documented  
✅ Ready to test right now  

Start with `END_TO_END_VERIFICATION.md` for the testing checklist.

Questions? Each doc has a table of contents and cross-references.

Good luck! 🚀
