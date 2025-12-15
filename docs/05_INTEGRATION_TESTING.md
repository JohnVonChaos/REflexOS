# Phase 5: Integration & Validation

## Integration Points

### 1. Context System + Resurfacing
- Tiered context feeds into resurfacing scheduler
- Intrusive memories respect tier budgets
- Evicted items can still resurface if scheduled

### 2. Lüscher + Context Priority
- High stress states boost affiliation-related items to 'hot'
- Low stimulation states prefer 'warm' over 'cold' intrusions
- Profile shifts trigger context re-prioritization

### 3. Idle Background + All Systems
- Background research creates new context items
- Synthesis generates new axioms with proper tiers
- Preparation pre-loads context for next active turn
- All background work respects budget limits

### 4. SRG + Everything
- SRG scores feed into intrinsicValue calculation
- High semantic similarity boosts resurfacing importance
- SRG traces used in post-turn evaluation

## End-to-End Test Scenarios

### Scenario 1: Crisis Response
1. User reports production outage
2. System detects high-stress keywords
3. Context shifts to 'active' mode (8k budget)
4. Non-critical items evicted to 'warm'
5. Crisis-relevant axioms promoted to 'hot'
6. Vessel responds with appropriate urgency
7. After resolution, evicted items restore
8. Background cycle researches related prevention

### Scenario 2: Creative Session
1. User in exploratory conversation
2. System in 'idle' mode between turns (32k budget)
3. Fibonacci scheduler surfaces old insights
4. Synthesis cycle connects old+new ideas
5. Next user turn benefits from novel synthesis
6. Lüscher profile shows increased stimulation need
7. Tone shifts to more energetic engagement

### Scenario 3: Emotional Support
1. User shares difficult situation
2. Lüscher re-test shows state shift (high stress, high affiliation need)
3. Context re-prioritized for empathy-related axioms
4. Resurfacing brings back relevant past support moments
5. Background research finds helpful resources
6. Vessel response tuned for validation + support
7. Follow-up Lüscher shows reduced stress

### Scenario 4: Long-Term Relationship
1. 100+ turn conversation
2. Multiple Lüscher profiles show state evolution
3. Fibonacci resurfacing prevents echo chamber
4. Synthesis cycles create autobiographical coherence
5. Background preparation anticipates recurring needs
6. Context tiers prevent memory collapse
7. Vessel maintains consistent identity while adapting

## Performance Benchmarks

### Response Time
- Active turn: <2s to first token
- Idle background cycle: <5s per cycle
- Context assembly: <500ms
- Lüscher processing: <100ms

### Memory Usage
- Context items: <10MB per 1000 items
- Resurfacing scheduler: <1MB
- Lüscher history: <100KB per user
- Background tasks: <5MB overhead

### Quality Metrics
- Vessel lifespan: >100 turns without collapse
- User "felt seen" rate: >70%
- Creative synthesis rate: >5 per 100 turns
- Background research relevance: >60%
- State tracking accuracy: >80%

## Rollout Plan

### Week 1-2: Context Tiers
- Deploy to 10% of new vessels
- Monitor for context bloat/starvation
- Validate eviction/restoration cycles
- Adjust tier thresholds based on data

### Week 2-3: Fibonacci Resurfacing
- Add to context tier vessels
- Track intrusive memory usage rates
- Tune category balance
- Measure creative collision increase

### Week 3-4: Lüscher Integration
- Deploy jelly bean UI
- Integrate profile processing
- Test empathetic tuning
- Validate privacy (no leaks)

### Week 4-5: Idle Background
- Enable background loops
- Monitor resource usage
- Track research quality
- Tune cycle frequency

### Week 5-6: Full Integration
- Enable all systems together
- Run end-to-end scenarios
- Collect user feedback
- Tune based on real usage
- Document lessons learned

## Success Criteria
- All integration points working smoothly
- Performance within benchmarks
- Quality metrics met or exceeded
- Zero critical bugs
- User satisfaction increased
- Vessel lifespan extended
- System ready for production scaling
