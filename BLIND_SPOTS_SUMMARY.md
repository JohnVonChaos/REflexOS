# 🎯 Blind Spots - Quick Reference

## 🔥 Top 10 Critical Issues

### 1. 🔴 Only 2 Files Have Error Handling
- **Impact:** Application crashes on API failures
- **Files:** 90+ files lack try-catch blocks
- **Fix:** Add global error boundary + try-catch all async

### 2. 🔴 IndexedDB Fails Silently
- **Impact:** User data lost without notification
- **Location:** `sessionService.ts`, `srgService.ts`
- **Fix:** Add user notifications + retry logic

### 3. 🔴 Race Condition in State Refs
- **Impact:** Duplicate research, stale data bugs
- **Location:** `useChat.ts:77-97`
- **Fix:** Use Redux/Zustand, atomic updates

### 4. 🔴 134 Uses of 'any' Type
- **Impact:** No type safety, runtime errors
- **Files:** 37 files affected
- **Fix:** Define proper interfaces, use type guards

### 5. 🟠 Concurrent Timer Conflicts
- **Impact:** Background tasks collide
- **Location:** `useChat.ts:247-272`
- **Fix:** Implement mutex/queue system

### 6. 🟠 Duplicate Query Detection Fails
- **Impact:** Wasted API costs
- **Location:** `useChat.ts:527-530`
- **Evidence:** "CRITICAL" error logs show it happens
- **Fix:** Use content hashing + distributed lock

### 7. 🟠 API Key Exposure Risk
- **Impact:** Security breach, quota exhaustion
- **Location:** `geminiService.ts`
- **Fix:** Secure storage, key rotation, rate limits

### 8. 🟠 No Rate Limiting
- **Impact:** Runaway API costs
- **Location:** Background cognition cycles
- **Fix:** Add circuit breaker, cost tracking

### 9. 🟡 Session Saves on Every Change
- **Impact:** Performance degradation, quota errors
- **Location:** `useChat.ts:238-243`
- **Fix:** Debounce saves (2s), dirty flag

### 10. 🟡 Prompt Injection Risk
- **Impact:** AI manipulation, data leakage
- **Location:** All prompt construction
- **Fix:** Input validation, structured formats

---

## 📊 Statistics

| Metric | Value |
|--------|-------|
| Total Issues Found | 57 |
| Critical Issues | 12 |
| High Priority | 23 |
| Medium Priority | 15 |
| Low Priority | 7 |
| Files with 'any' | 37 |
| 'any' Type Uses | 134 |
| Files with Timers | 17 |
| Try-Catch Blocks | 2 |
| JSON.parse Calls | 68 |

---

## 🚀 Quick Wins (< 1 Day Each)

1. ✅ Add global React error boundary
2. ✅ Wrap all async functions in try-catch
3. ✅ Add user notifications for IndexedDB errors
4. ✅ Debounce session saves
5. ✅ Add API rate limit warnings
6. ✅ Fix 20 most critical 'any' types
7. ✅ Add JSON.parse error handling
8. ✅ Implement mutex for background timers

---

## 🎯 Priority Matrix

```
CRITICAL (Do First)     HIGH (This Week)        MEDIUM (This Month)
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Error Handling  │    │ Type Safety     │    │ Performance     │
│ IndexedDB Fixes │    │ Deduplication   │    │ JSON Validation │
│ Race Conditions │    │ Rate Limiting   │    │ Token Counting  │
│ State Sync      │    │ Security Keys   │    │ Prompt Sanitize │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 📁 Files Requiring Immediate Attention

1. `useChat.ts` - Multiple critical issues (race conditions, refs, timers)
2. `sessionService.ts` - Silent failures, no error recovery
3. `geminiService.ts` - API key exposure, no error handling
4. `srgService.ts` - Memory leaks, sync issues
5. `backgroundOrchestrator.ts` - Timer cleanup, error boundaries

---

## 🔗 Full Report

See **`BLIND_SPOTS_REPORT.md`** for detailed analysis with:
- Code examples
- Line numbers
- Architectural recommendations
- Phase-by-phase action plan
- Risk assessment

---

**Next Steps:** Review full report → Prioritize fixes → Create tickets → Sprint planning
