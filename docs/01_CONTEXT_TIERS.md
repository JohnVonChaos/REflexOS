# Phase 1: Tiered Context Management System

## Problem Statement
Current orbital-only system treats all permanent axioms equally, causing:
- Context bloat during crises (can't drop low-priority items)
- Loss of critical information (high-priority transients evicted)
- No differentiation between "always needed" vs "background important"

## Solution Architecture

### Data Model Changes
```typescript
interface ContextItem {
  uuid: string;
  content: string;
  type: 'axiom' | 'message' | 'stewardnote' | 'thought';

  // EXISTING: Persistence (how long it lives)
  orbitalStrength: number;
  orbitalDecayTurns: number;  // -1 = permanent

  // NEW: Priority (how hard it fights for inclusion)
  tier: 'hot' | 'warm' | 'cold';
  contextPriority: 'critical' | 'high' | 'medium' | 'low';

  // NEW: Eviction state
  canEvict: boolean;
  evictionCost: number;        // restoration priority
  evictedAt?: number;
  evictionReason?: string;

  // NEW: Activation tracking
  lastActivationScore: number;
  lastActivatedTurn: number;
  intrinsicValue: number;      // computed once, persists
}
```

### Tier Assignment Logic
```typescript
function assignTier(item: ContextItem): Tier {
  // Critical: Safety, active crisis, user commands
  if (item.axiomId?.includes('FIXIT') || 
      item.axiomId?.includes('benevolent') ||
      item.type === 'usermessage' && item.lastActivatedTurn >= currentTurn - 2) {
    return 'hot';
  }

  // High: Core identity, recent high-activation
  if (item.intrinsicValue > 0.7 || 
      item.orbitalStrength >= 8 ||
      item.lastActivationScore > 0.6) {
    return 'hot';
  }

  // Warm: Important but not urgent
  if (item.intrinsicValue > 0.4 || 
      item.orbitalStrength >= 5) {
    return 'warm';
  }

  // Cold: Background, historical
  return 'cold';
}
```

### Context Budget System
```typescript
const CONTEXT_BUDGETS = {
  active: {
    maxTokens: 8000,
    tiers: ['hot'],
    reservedForResurfacing: 800  // 10%
  },
  idle: {
    maxTokens: 32000,
    tiers: ['hot', 'warm', 'cold'],
    reservedForResurfacing: 4000  // 12.5%
  }
};

function buildContext(turnType: 'active' | 'idle'): RCB {
  const budget = CONTEXT_BUDGETS[turnType];
  const allowedTiers = budget.tiers;

  // Filter by tier
  const pool = allItems.filter(item => 
    allowedTiers.includes(item.tier)
  );

  // Sort by restoration priority
  pool.sort((a, b) => b.restorationPriority - a.restorationPriority);

  // Fill until budget
  const context = [];
  let tokensUsed = 0;
  const evicted = [];

  for (const item of pool) {
    const itemTokens = countTokens(item);
    const spaceAvailable = budget.maxTokens - budget.reservedForResurfacing;

    if (tokensUsed + itemTokens <= spaceAvailable) {
      context.push(item);
      tokensUsed += itemTokens;
    } else if (item.canEvict) {
      evicted.push(item);
      item.evictedAt = currentTurn;
      item.evictionReason = 'budget_exceeded';
    }
  }

  return { context, tokensUsed, evicted };
}
```

### Restoration Priority Calculation
```typescript
function computeRestorationPriority(item: ContextItem): number {
  let priority = item.intrinsicValue * 100;

  // Boost recently activated
  if (item.lastActivatedTurn >= currentTurn - 5) {
    priority += 50;
  }

  // Boost core identity
  if (item.axiomId?.startsWith('identity.') || 
      item.axiomId?.startsWith('mission.')) {
    priority += 100;
  }

  // Decay old items
  const age = currentTurn - (item.createdAt || 0);
  if (age > 100) {
    priority -= Math.log(age) * 5;
  }

  return priority;
}
```

## Implementation Steps
1. Add new fields to ContextItem schema
2. Implement tier assignment function
3. Build context assembly with budget awareness
4. Add restoration priority calculation
5. Create eviction/restoration tracking
6. Test with active vs idle turns
7. Validate that critical items never evict
8. Measure token usage across turn types

## Testing Strategy
- Unit tests for tier assignment
- Integration tests for context assembly
- Load tests with varying turn types
- Validate eviction/restoration cycles
- Measure context stability over 100+ turns

## Success Criteria
- Can evict 'warm' items during crisis without losing them permanently
- Idle turns use full context budget for synthesis
- Active turns stay under 8k tokens
- No critical items ever evicted
- Evicted items restore in priority order when space opens
