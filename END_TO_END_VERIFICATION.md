# End-to-End Verification Checklist

## Pre-Flight Checks (Before Running)

- [ ] TypeScript compiles with no errors in `useChat.ts`
- [ ] TypeScript compiles with no errors in `backgroundCognitionService.ts`
- [ ] `searchapi.py` is available and ready to run
- [ ] Port 8001 is available (for the search API)
- [ ] Browser console can be opened (F12)

## Runtime Verification (During Testing)

### Phase 1: Startup
- [ ] App starts without errors
- [ ] Chat interface loads
- [ ] No errors in the browser console

### Phase 2: Trigger L2 Search
**What to do:** Ask a prompt that will cause L2 to research something

**Example prompts:**
- "Plan how I should build a web search feature"
- "What's the best approach to implement AI planning?"
- "Research and summarize planning methodologies"
- "Create a strategic plan for improving the system"

**Expected result:** L2 starts generating text with a `? search.brave` command

### Phase 3: Monitor Logs
**What to watch for in the browser console (F12 → Console):**

**✅ Step 1: Scanning Phase**
```
DEBUG [L2_PLANNER] Scanning N lines for commands (isStreamEnd=false)
DEBUG [L2_PLANNER]   Line 0: RAW="..." | CLEAN="..." | isCmd=false
DEBUG [L2_PLANNER]   Line 3: RAW="> **? search.brave xyz**" | CLEAN="? search.brave xyz" | isCmd=true
```

**Verification:**
- [ ] "Scanning" message appears
- [ ] At least one line shows `isCmd=true`
- [ ] The RAW line shows markdown formatting
- [ ] The CLEAN line shows no markdown

**✅ Step 2: Detection Phase**
```
INFO [L2_PLANNER] FOUND COMMAND at line 3 of 10
DEBUG [L2_PLANNER] Command position: isLastLine=false, isStreamEnd=false
DEBUG [L2_PLANNER] Raw command line: "> **? search.brave planning**"
DEBUG [L2_PLANNER] Normalized command line: "? search.brave planning"
INFO [L2_PLANNER] ✅ Detected command: ? search.brave planning
```

**Verification:**
- [ ] "FOUND COMMAND" appears
- [ ] Line number and total lines shown
- [ ] Raw vs normalized versions are different
- [ ] Normalized version doesn't have markdown characters
- [ ] "✅ Detected command" appears with the cleaned text

**✅ Step 3: Execution Phase**
```
INFO [L2_PLANNER] Executing web search: "planning"
INFO [L2_PLANNER] Command result: 2847 chars
```

**Verification:**
- [ ] "Executing web search" appears
- [ ] The query shown is reasonable (not empty, not full command)
- [ ] "Command result" appears
- [ ] The number is > 0 (got results from API)

**✅ Step 4: Re-injection Phase**
```
INFO [L2_PLANNER] Breaking stream to re-feed model with command results
```

**Verification:**
- [ ] "Breaking stream" message appears
- [ ] L2 continues generating (doesn't get stuck)
- [ ] The new text from L2 references the search results

### Phase 4: Verify Output
**What to check in the chat UI:**

- [ ] L2's final response includes search results in quotes (e.g., "[WEB SEARCH RESULTS] ...")
- [ ] The search results are relevant to the query
- [ ] L2's response synthesizes the search results into its planning
- [ ] The command line itself does NOT appear in the output (should be hidden)

**Example of correct output:**
```
L2: Based on my research into planning methodologies:

[WEB SEARCH RESULTS]
According to recent sources, effective planning involves...
[SOURCES]
https://example.com/planning
https://example.com/strategy

This means our approach should focus on...
```

## Failure Mode Checklist

If something doesn't work, check these:

### Issue: No "Scanning" log appears
- [ ] Did you ask a prompt that triggers L2?
- [ ] Is L2 enabled in the role settings?
- [ ] Did L2 actually generate any output?
- [ ] Is the browser console open and not filtered?

### Issue: "Scanning" appears but no "isCmd=true" lines
- [ ] L2 didn't emit a command
- [ ] Try a different prompt that's more explicit about needing research
- [ ] Example: "Search for planning strategies and summarize them"

### Issue: "isCmd=true" appears but no "FOUND COMMAND"
- [ ] The regex didn't match this line's formatting
- [ ] Check the RAW line - does it have unexpected formatting?
- [ ] May need to add more characters to the normalization regex

### Issue: "FOUND COMMAND" but "Normalized command" looks wrong
- [ ] The regex isn't stripping all the markdown
- [ ] Check what extra characters are in the normalized version
- [ ] The issue is in this regex: `/^[\s*`#>_~|:*]+/`

### Issue: "Detected command" but no "Executing web search"
- [ ] Command parsing failed
- [ ] The command might not start with `? search.brave`
- [ ] Check if it's `?search.brave` (no space) - the regex looks for `? ` with space
- [ ] May need to add more command prefix patterns to the detector

### Issue: "Executing web search" but "Command result: 0 chars"
- [ ] The API didn't return results
- [ ] Check if `searchapi.py` is running on port 8001
- [ ] Check if the query is empty or invalid
- [ ] Run a test: Open terminal and run `python searchapi.py` in the right directory
- [ ] Test the API manually: Visit `http://localhost:8001/docs` (FastAPI auto-docs)

### Issue: "Command result" appears but L2 output looks wrong
- [ ] Results were returned but not properly re-injected
- [ ] Check if "Breaking stream" message appears
- [ ] The re-injection logic in `useChat.ts` may need debugging
- [ ] Try a simpler prompt to isolate the issue

### Issue: Command text appears in the final output
- [ ] The text stripping logic didn't work correctly
- [ ] The line that should have been removed (from `textBeforeCommand`) was included anyway
- [ ] Check the `newText` vs `result` logic in the command execution

## Success Verification

All of the following should be true:

1. ✅ Browser console shows "Scanning" debug logs
2. ✅ At least one line shows "isCmd=true" in the line breakdown
3. ✅ Browser console shows "FOUND COMMAND" confirmation
4. ✅ Raw and normalized command lines are shown, and they're different
5. ✅ "Executing web search" message appears with a sensible query
6. ✅ "Command result" appears with a > 0 character count
7. ✅ "Breaking stream to re-feed" message appears
8. ✅ L2's final output in the chat includes "[WEB SEARCH RESULTS]"
9. ✅ L2's text synthesizes those results into its response
10. ✅ No raw command text (like `? search.brave`) appears in the chat

If all 10 are true, **the entire pipeline is working correctly**.

## Quick Test Script

If you want to verify manually:

### Test 1: Check Logs Appear
```javascript
// In browser console, run:
console.log("[TEST] Can you see this?");
```

### Test 2: Trigger L2
In chat, ask:
```
Plan a project to build a web search system. Include research on planning methodologies.
```

### Test 3: Watch Browser Console
Keep console open and wait for logs starting with `[L2_PLANNER]`.

### Test 4: Verify Search API Running
In PowerShell or terminal:
```
curl http://localhost:8001/docs
```

Should return FastAPI auto-documentation page. If this fails, the API isn't running.

## Logs to Look For (Copy-Paste Search)

Use browser console's search/filter feature to find these messages:

**To find all command detections:**
```
Detected command
```

**To find all search executions:**
```
Executing web search
```

**To find all results:**
```
Command result
```

**To find all stream breaks:**
```
Breaking stream
```

**To find all errors:**
```
ERROR
```

**To find L2-specific logs:**
```
[L2_PLANNER]
```

## Success Indicators in Chat UI

The search worked if you see:

1. L2 generates text about planning/analysis
2. The text includes a section marked "[WEB SEARCH RESULTS]"
3. That section contains URLs and research summaries
4. L2's synthesis talks about what it learned from the search
5. The response flows naturally (command is hidden)

The search failed if you see:

1. L2 generates text but with "[NO SEARCH RESULTS]"
2. L2 hallucinates answers without search context
3. The command text appears as literal text in the output
4. L2 gets stuck or repeats itself

## Emergency Debugging

If nothing works:

1. **Check Python API:**
   ```powershell
   # In terminal:
   python c:\...\searchapi.py
   ```
   Should start a server on localhost:8001

2. **Test API directly:**
   ```powershell
   # In PowerShell:
   curl -Method POST http://localhost:8001/search -Body '{"query":"test"}' -ContentType "application/json"
   ```
   Should return search results

3. **Check browser console for errors:**
   Look for any red errors in F12 → Console
   Check Network tab (F12 → Network) for failed requests

4. **Verify TypeScript compilation:**
   The files should compile with no errors before running

5. **Review the regex:**
   The normalization regex is: `/^[\s*`#>_~|:*]+/`
   If markdown isn't being stripped, this regex might need updating

## Files to Check If Debugging Needed

| File | Lines | Purpose |
|------|-------|---------|
| `hooks/useChat.ts` | 1155-1200 | Command detection & normalization |
| `hooks/useChat.ts` | 1305-1310 | Mid-stream interruption |
| `hooks/useChat.ts` | 1355-1360 | End-of-stream check |
| `services/backgroundCognitionService.ts` | 543-580 | Background command execution |
| `services/searchapi.py` | 1-50 | API startup |
| `services/searchapi.py` | 90-120 | Query validation |

## Contacts for Help

If the logs show you're stuck at a specific phase:
- **Detection failed** → Check the regex or command format
- **Parsing failed** → Check the command prefix matching
- **Execution failed** → Check the API on port 8001
- **Re-injection failed** → Check useChat.ts stream logic
- **API failed** → Run searchapi.py manually and test with curl

Good luck! 🚀
