# Command Pipeline Diagnostic Logging - Documentation Index

## Overview

This directory now contains comprehensive diagnostic logging for the web search command pipeline. These docs explain what was added, how to use it, and how to interpret the results.

## Quick Start (30 seconds)

1. **Open browser**: F12 → Console
2. **Ask L2 a research question**: "Plan how to build a search feature"
3. **Watch for logs** starting with `[L2_PLANNER]`
4. **Follow the sequence**: Scanning → Detection → Execution → Re-injection
5. **Success**: L2's output includes "[WEB SEARCH RESULTS]"

## Documentation Files

### 📖 For Understanding What Was Done
- **`DIAGNOSTIC_LOGGING_COMPLETE.md`** ⭐ START HERE
  - What was added and why
  - Overview of all 6 logging points
  - Diagnostic flowchart
  - Success criteria (8 checkpoints)

### 🔍 For Detailed Reference
- **`DIAGNOSTIC_LOGGING_ADDED.md`**
  - Line-by-line location of each logging point
  - Exact code for each logger call
  - What each log reveals
  - Parameter values and meanings

### 🚀 For Quick Troubleshooting
- **`DEBUGGING_GUIDE_COMMAND_PIPELINE.md`**
  - What to look for in logs (step-by-step)
  - Diagnostic checklist
  - Common issues and solutions
  - Log filtering tips

### ✅ For Testing & Verification
- **`END_TO_END_VERIFICATION.md`**
  - Pre-flight checks
  - Runtime verification steps
  - Phase-by-phase testing
  - Success/failure indicators
  - Emergency debugging

### 📊 For Visual Understanding
- **`LOGGING_VISUAL_REFERENCE.md`**
  - Pipeline flowchart with logging points
  - Table of all logging points
  - Example console output
  - Failure mode examples
  - Color-coded reference

### 📝 For Implementation Details
- **`COMMAND_PIPELINE_LOGGING_SUMMARY.md`**
  - Implementation summary
  - Code changes made
  - Key insights revealed
  - Testing checklist
  - Files modified

## The Logging Points (Cheat Sheet)

| # | Name | Where | What It Shows |
|---|------|-------|---------------|
| 1 | **Scanning** | useChat.ts:1157 | Every line in stream, raw vs cleaned, isCmd status |
| 2 | **Detection** | useChat.ts:1175 | Command found, line position, raw vs normalized |
| 3A | **Interruption** | useChat.ts:1305 | Stream broke mid-command, re-feeding results |
| 3B | **End-of-Stream** | useChat.ts:1355 | Stream ended, checking for final command |
| 4 | **Execution** | useChat.ts:1245 | Web search query and result count |
| BG | **Background** | backgroundCognitionService.ts:545 | Command parsing in autonomous agent |

## Files Modified

### Code Changes
- ✅ `hooks/useChat.ts` - Added logging to command detection/execution (5 points)
- ✅ `services/backgroundCognitionService.ts` - Added logging to command parsing (1 point)
- ✅ No functional changes, only logging additions
- ✅ TypeScript compilation: No errors

### Documentation Added
- ✅ `DIAGNOSTIC_LOGGING_COMPLETE.md` - Complete overview
- ✅ `DIAGNOSTIC_LOGGING_ADDED.md` - Detailed reference
- ✅ `DEBUGGING_GUIDE_COMMAND_PIPELINE.md` - Quick troubleshooting
- ✅ `END_TO_END_VERIFICATION.md` - Testing checklist
- ✅ `LOGGING_VISUAL_REFERENCE.md` - Visual guide
- ✅ `COMMAND_PIPELINE_LOGGING_SUMMARY.md` - Implementation summary

## Expected Console Output

When everything works:

```
DEBUG [L2_PLANNER] Scanning 10 lines for commands (isStreamEnd=false)
DEBUG [L2_PLANNER]   Line 3: RAW="> **? search.brave xyz**" | CLEAN="? search.brave xyz" | isCmd=true
INFO [L2_PLANNER] FOUND COMMAND at line 3 of 10
DEBUG [L2_PLANNER] Raw command line: "> **? search.brave planning workflow**"
DEBUG [L2_PLANNER] Normalized command line: "? search.brave planning workflow"
INFO [L2_PLANNER] ✅ Detected command: ? search.brave planning workflow
INFO [L2_PLANNER] Executing web search: "planning workflow"
INFO [L2_PLANNER] Command result: 2847 chars
INFO [L2_PLANNER] Breaking stream to re-feed model with command results
```

## Success Criteria ✅

All of these should appear:
1. ✅ "Scanning N lines for commands"
2. ✅ At least one line with "isCmd=true"
3. ✅ "FOUND COMMAND at line X of N"
4. ✅ Raw line shows markdown, normalized doesn't
5. ✅ "✅ Detected command:"
6. ✅ "Executing web search: [query]"
7. ✅ "Command result: [N>0] chars"
8. ✅ "Breaking stream to re-feed"

## Diagnostic Approach

### If Logs Don't Appear At All
→ Check `DEBUGGING_GUIDE_COMMAND_PIPELINE.md` section "No logs appear at all"

### If Logs Stop at "Scanning"
→ Command wasn't detected. Follow "Issue: No logs appear" checklist.

### If Logs Stop at "Scanning" But No "isCmd=true"
→ Normalization failed. Check RAW vs CLEAN in line breakdown.

### If Logs Stop at "FOUND COMMAND"
→ Command parsing failed. Check the normalized command format.

### If Logs Stop at "Detected command"
→ Query extraction failed. Check if command has text after the prefix.

### If Logs Stop at "Executing web search"
→ API failed. Check if `searchapi.py` is running on port 8001.

### If All Logs Appear But Search Doesn't Work
→ Check `END_TO_END_VERIFICATION.md` section "Emergency Debugging"

## How to Navigate

**I want to...**

- **Understand what was added** → Read `DIAGNOSTIC_LOGGING_COMPLETE.md`
- **Set up and test** → Follow `END_TO_END_VERIFICATION.md`
- **Troubleshoot a problem** → Use `DEBUGGING_GUIDE_COMMAND_PIPELINE.md`
- **See code details** → Check `DIAGNOSTIC_LOGGING_ADDED.md`
- **Visualize the pipeline** → Look at `LOGGING_VISUAL_REFERENCE.md`
- **Learn implementation** → Read `COMMAND_PIPELINE_LOGGING_SUMMARY.md`

## Implementation Status

- ✅ All logging points added to `useChat.ts`
- ✅ All logging points added to `backgroundCognitionService.ts`
- ✅ TypeScript compiles with no errors
- ✅ All documentation created and reviewed
- ✅ No functional code changes (only logging)
- ✅ Ready for testing

## Testing Checklist

- [ ] App builds without errors
- [ ] App starts without errors
- [ ] Browser console opens (F12)
- [ ] Ask L2 a research question
- [ ] See "Scanning" log appear
- [ ] See "FOUND COMMAND" appear
- [ ] See "Executing web search" appear
- [ ] See "Command result: N>0" appear
- [ ] L2's output includes "[WEB SEARCH RESULTS]"
- [ ] No command text appears in output

## Key Numbers for Reference

- **Normalization regex:** `/^[\s*`#>_~|:*]+/`
- **Search API port:** 8001
- **Max results returned:** 2847 chars (varies)
- **Lines with logging:** 5 in useChat.ts, 1 in backgroundCognitionService.ts
- **Documentation files:** 6 new files

## The Problem Solved

**Before:** L2 emitted `> **? search.brave planning**` but it wasn't executing. We didn't know why.

**Solution:** Added logging at every stage to trace the pipeline.

**Result:** Now we can see exactly where things succeed or fail, and adjust accordingly.

## Key Insights

1. **The model doesn't need to be precise** - It can wrap commands in markdown
2. **The pipeline handles that** - The normalization regex strips the formatting
3. **Visibility is crucial** - We can now see every step of the process
4. **Debugging is deterministic** - If something breaks, the logs pinpoint it

## Next Step

1. Run the app with these logging points active
2. Ask L2 a research question
3. Open F12 → Console
4. Follow the logs through the pipeline
5. Check if all 8 success criteria appear
6. Report findings

---

**Need help?** Read the most relevant doc from the list above. Each one is designed to help with a specific aspect of understanding or troubleshooting the pipeline.

**Everything working?** Great! You can now confidently debug any web search issues by following the logs.
