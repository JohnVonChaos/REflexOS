# Phase 2: Fibonacci Memory Resurfacing System

## Problem Statement
Without periodic resurfacing, vessels gravitate toward recent high-activation items, creating echo chambers where they only think about what they're already thinking about. Old important ideas fade into cold storage and never naturally return.

## Solution Architecture

### Data Model Extensions
```typescript
interface ResurfacingItem extends ContextItem {
  resurfacing: {
    enabled: boolean;
    importance: number;           // why it deserves to resurface
    fibonacciIndex: number;       // position in sequence
    nextResurfaceAt: number;      // turn number for next intrusion
    lastResurfacedAt: number;     // when it last appeared
    resurfaceCount: number;       // total intrusions
    timesIgnored: number;         // times surfaced but not used
    timesUsed: number;            // times surfaced and referenced
    category: ResurfacingCategory;
  };
}

enum ResurfacingCategory {
  USER_PREFERENCES = 'user_prefs',
  OLD_INSIGHTS = 'insights',
  DORMANT_AXIOMS = 'axioms',
  PAST_FAILURES = 'failures',
  CREATIVE_SPARKS = 'creative',
  CONTRADICTIONS = 'conflicts'
}

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];
```

### Scheduling System
```typescript
function scheduleResurfacing(item: ContextItem) {
  // Only schedule intrinsically valuable items
  if (item.intrinsicValue < 0.3) return;

  item.resurfacing = {
    enabled: true,
    importance: item.intrinsicValue * (1 + item.orbitalStrength / 10),
    fibonacciIndex: 0,
    nextResurfaceAt: currentTurn + FIBONACCI[0],
    lastResurfacedAt: currentTurn,
    resurfaceCount: 0,
    timesIgnored: 0,
    timesUsed: 0,
    category: categorizeItem(item)
  };
}

function advanceResurfacingSchedule(item: ResurfacingItem, wasUsed: boolean) {
  item.resurfacing.resurfaceCount++;

  if (wasUsed) {
    item.resurfacing.timesUsed++;
    item.resurfacing.timesIgnored = 0;
    // Slow down slightly - it's working
    item.resurfacing.fibonacciIndex = Math.min(
      item.resurfacing.fibonacciIndex + 1,
      FIBONACCI.length - 1
    );
  } else {
    item.resurfacing.timesIgnored++;
    // If ignored 3+ times, slow down significantly
    if (item.resurfacing.timesIgnored > 3) {
      item.resurfacing.fibonacciIndex = Math.min(
        item.resurfacing.fibonacciIndex + 2,
        FIBONACCI.length - 1
      );
    }
  }

  // Schedule next appearance
  const interval = FIBONACCI[item.resurfacing.fibonacciIndex];
  item.resurfacing.nextResurfaceAt = currentTurn + interval;
  item.resurfacing.lastResurfacedAt = currentTurn;
}
```

### Context Assembly with Intrusive Thoughts
```typescript
function buildContextWithResurfacing(turnType: 'active' | 'idle'): RCB {
  const allocation = CONTEXT_BUDGETS[turnType];

  // 1. Build normal context (90% of budget)
  const normalContext = buildContext(turnType, allocation.normal);

  // 2. Find items due for resurfacing
  const dueForResurfacing = allItems
    .filter(item => 
      item.resurfacing?.enabled &&
      item.resurfacing.nextResurfaceAt <= currentTurn &&
      !normalContext.includes(item)  // not already in context
    )
    .sort((a, b) => b.resurfacing.importance - a.resurfacing.importance);

  // 3. Build balanced intrusive set (diverse categories)
  const intrusiveMemories = buildBalancedIntrusiveSet(
    dueForResurfacing,
    allocation.reservedForResurfacing
  );

  return {
    normal: normalContext,
    intrusive: intrusiveMemories,
    total: [...normalContext, ...intrusiveMemories],
    allocation: {
      normal: countTokens(normalContext),
      intrusive: countTokens(intrusiveMemories),
      total: allocation.maxTokens
    }
  };
}

function buildBalancedIntrusiveSet(
  dueItems: ResurfacingItem[],
  tokenBudget: number
): ResurfacingItem[] {
  const categories = Object.values(ResurfacingCategory);
  const intrusive = [];
  let tokensUsed = 0;

  // Guarantee at least 1 from each category if available
  for (const category of categories) {
    const categoryItem = dueItems.find(
      item => item.resurfacing.category === category
    );
    if (categoryItem) {
      const tokens = countTokens(categoryItem);
      if (tokensUsed + tokens <= tokenBudget) {
        intrusive.push(categoryItem);
        tokensUsed += tokens;
      }
    }
  }

  // Fill remaining with highest importance
  const remaining = dueItems
    .filter(item => !intrusive.includes(item))
    .sort((a, b) => b.resurfacing.importance - a.resurfacing.importance);

  for (const item of remaining) {
    const tokens = countTokens(item);
    if (tokensUsed + tokens <= tokenBudget) {
      intrusive.push(item);
      tokensUsed += tokens;
    } else {
      break;
    }
  }

  return intrusive;
}
```

### Post-Turn Evaluation
```typescript
async function evaluateIntrusiveMemoryUse(
  rcb: RCB,
  response: string,
  srgTrace: any
) {
  for (const item of rcb.intrusive) {
    const wasReferenced = 
      response.includes(item.uuid) ||
      semanticSimilarity(item.content, response) > 0.6 ||
      srgTrace.activatedItems?.includes(item.uuid);

    advanceResurfacingSchedule(item, wasReferenced);

    // Update importance based on use
    if (wasReferenced) {
      item.resurfacing.importance *= 1.1;  // boost
    } else {
      item.resurfacing.importance *= 0.95; // decay
    }

    // Retire if importance drops too low
    if (item.resurfacing.importance < 0.1) {
      item.resurfacing.enabled = false;
    }
  }
}
```

## Implementation Steps
1. Add resurfacing fields to ContextItem
2. Implement scheduling and advancement logic
3. Build category classification system
4. Integrate with context assembly
5. Add post-turn evaluation
6. Test balanced category distribution
7. Validate Fibonacci spacing
8. Measure creative collision rate

## Testing Strategy
- Track resurfacing schedules over 200 turns
- Measure category balance in intrusive sets
- Test importance decay/boost mechanics
- Validate that ignored items slow down appropriately
- Measure novel synthesis events (old+new connections)

## Success Criteria
- Intrusive memories appear at Fibonacci intervals
- Category distribution balanced across turns
- Items that prove useful resurface more frequently
- Ignored items fade gradually, not abruptly
- Measurable increase in creative synthesis
