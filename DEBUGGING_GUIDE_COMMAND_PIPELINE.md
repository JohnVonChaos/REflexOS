# Quick Debugging Guide - Command Pipeline Trace

## TL;DR - How to Verify the Fix Works

1. **Open browser DevTools**: F12 → Console tab
2. **Type a prompt that triggers L2**: "Plan out how I should approach building a search feature"
3. **Watch the logs** for the traces below
4. **Verify the search executes** by seeing "Executing web search" and "Command result"

## Expected Log Sequence (Happy Path)

When L2 emits: `> **? search.brave planning approach**`

```
DEBUG [L2_PLANNER] Scanning 10 lines for commands (isStreamEnd=false)
DEBUG [L2_PLANNER]   Line 0: RAW="Here's my approach..." | CLEAN="Here's my approach..." | isCmd=false
DEBUG [L2_PLANNER]   Line 3: RAW="> **? search.brave planning approach**" | CLEAN="? search.brave planning approach" | isCmd=true
DEBUG [L2_PLANNER]   Line 4: RAW="Let me search for..." | CLEAN="Let me search for..." | isCmd=false

INFO [L2_PLANNER] FOUND COMMAND at line 3 of 10
DEBUG [L2_PLANNER] Command position: isLastLine=false, isStreamEnd=false
DEBUG [L2_PLANNER] Raw command line: "> **? search.brave planning approach**"
DEBUG [L2_PLANNER] Normalized command line: "? search.brave planning approach"
INFO [L2_PLANNER] ✅ Detected command: ? search.brave planning approach

INFO [L2_PLANNER] Executing web search: "planning approach"
INFO [L2_PLANNER] Command result: 2847 chars

INFO [L2_PLANNER] Breaking stream to re-feed model with command results
```

Then L2 will get the search results re-fed and continue synthesis with those results.

## Diagnostic Checklist

Use this to diagnose what's happening if the search doesn't execute:

### ✅ Command Detection Phase
- [ ] Do you see "Scanning N lines for commands"?
- [ ] Do any lines show "isCmd=true"?
- [ ] Do you see "FOUND COMMAND"?

**If not:** Command format doesn't match the regex. Check the RAW vs CLEAN output.

### ✅ Normalization Phase
- [ ] Do you see the raw command line with markdown?
- [ ] Do you see the normalized command line without markdown?
- [ ] Are they different? (Raw should have `>` or `**`, clean should not)

**If not:** The normalization regex isn't working. Open an issue with the RAW line.

### ✅ Detection Confirmation Phase
- [ ] Do you see "✅ Detected command"?
- [ ] Does it show the full command text?

**If not:** The command text doesn't start with `? `, `! `, `?srg`, or `?search`.

### ✅ Execution Phase
- [ ] Do you see "Executing web search"?
- [ ] Does it show the extracted query?

**If not:** Command parsing failed. The query extraction didn't work.

### ✅ Result Phase
- [ ] Do you see "Command result: XXXX chars"?
- [ ] Is the number > 0?

**If not:** The API returned no results or failed.

### ✅ Re-injection Phase
- [ ] Do you see "Breaking stream to re-feed model with command results"?
- [ ] Does L2 then continue with "Based on the search results..."?

**If not:** The command result wasn't re-injected, or the stream didn't break properly.

## Common Issues & What to Look For

### Issue: "Command detected, but search never executes"
**Look for:** "FOUND COMMAND" but no "Executing web search"
**Cause:** Command parsing failed
**Action:** Check if the command prefix matches one of: `search.brave`, `search.pw`, `search.both`

### Issue: "Executing web search, but no results"
**Look for:** "Executing web search: xyz" but "Command result: 0 chars"
**Cause:** API didn't return results
**Action:** Check if `searchapi.py` is running on port 8001

### Issue: "Everything executes, but command appears in output"
**Look for:** "Breaking stream to re-feed" with command text visible
**Cause:** Text before command wasn't stripped properly
**Action:** Check if `textBeforeCommand` extraction is working correctly

### Issue: "No logs appear at all"
**Cause 1:** Chat hasn't emitted a command yet
**Cause 2:** Browser console isn't open or filtered
**Cause 3:** Different layer triggered (check the stage name: L1, L2, L3, Ralph)
**Action:** Type a prompt, open F12 → Console, look for [L2_PLANNER] or [L3_VOICE]

## What Each Layer Does

- **L1_SUBCONSCIOUS**: Initial unconscious processing (rarely emits commands)
- **L2_PLANNER**: Strategic planning layer (should emit `? search.brave` for research)
- **L3_VOICE**: Final synthesis layer (should emit commands to execute plans)
- **RALPH_EXECUTOR**: Background execution layer (may emit commands for work orders)

Most search commands come from **L2_PLANNER**, so focus on those logs.

## Testing Prompts That Should Trigger L2 Search

1. "Plan how to build a feature"
2. "What's the best approach to solve this problem?"
3. "Research and summarize how to implement web search"
4. "Analyze the current state of the project"
5. "Plan the next steps for this system"

These prompts should cause L2 to emit `? search.brave` commands.

## Log Filtering Tips

### Filter to just L2 commands:
Console filter: `[L2_PLANNER]`

### Filter to just errors:
Console filter: `ERROR`

### Filter to just web search execution:
Console filter: `Executing web search`

### See full command pipeline:
Console filter: `Detected command|Scanning|Breaking stream|Command result`

## File Locations for Reference

- Main logic: `hooks/useChat.ts` lines 1145-1360
- Background logic: `services/backgroundCognitionService.ts` lines 543-575
- Web search backend: `services/searchapi.py` (Python)
- Normalization function: Uses regex `/^[\s*`#>_~|:*]+/` to strip markdown

## Success Criteria

The fix is working when:
1. ✅ L2 emits a command with markdown formatting
2. ✅ Logs show "Normalized command line" without the markdown
3. ✅ Logs show "✅ Detected command"
4. ✅ Logs show "Executing web search: [query]"
5. ✅ Logs show "Command result: [positive number] chars"
6. ✅ L2's synthesis includes the search results in its response
7. ✅ No command text appears in the final output

If all 7 are true, the end-to-end pipeline is working correctly!
