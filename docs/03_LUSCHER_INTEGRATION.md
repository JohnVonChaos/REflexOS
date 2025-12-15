# Phase 3: Lüscher Integration for Empathetic Tuning

## Problem Statement
Current vessels use chat history but lack deeper psychological grounding. Need real-time state tracking to tune tone, pacing, and empathetic responses without explicit diagnosis.

## Solution Architecture

### Lüscher Data Model
```typescript
interface LuscherProfile {
  timestamp: number;
  sequence: number[];  // 1-8, user's color order
  interpretation: {
    desiredObjectives: string;
    existingSituation: string;
    rejectedTraits: string;
    actualProblem: string;
  };
  stateVector: {
    stressLevel: number;         // 0-1
    affiliationNeed: number;     // 0-1 (connection seeking)
    autonomyNeed: number;        // 0-1 (independence seeking)
    stimulationNeed: number;     // 0-1 (engagement vs withdrawal)
    anxietyMarkers: number;      // 0-1
  };
  // Never shown to user
  forInternalUseOnly: true;
}

interface UserState {
  currentProfile: LuscherProfile;
  profileHistory: LuscherProfile[];  // track shifts over time
  lastTestAt: number;
  testCount: number;
}
```

### Jelly Bean Sorting Interface
```javascript
// Client-side capture
const jellyBeanSort = {
  colors: ['blue', 'green', 'red', 'yellow', 'violet', 'brown', 'black', 'grey'],
  sequence: [],

  onDrop(color) {
    this.sequence.push(color);
    if (this.sequence.length === 8) {
      sendToBackend(this.sequence);
    }
  }
};

// Backend processing
function processLuscherSequence(sequence: number[]): LuscherProfile {
  const interpretation = lookupTable(sequence);
  const stateVector = deriveStateVector(interpretation);

  return {
    timestamp: Date.now(),
    sequence,
    interpretation,
    stateVector,
    forInternalUseOnly: true
  };
}
```

### Empathetic Translation Layer
```typescript
function tuneToneForState(
  baseResponse: string,
  profile: LuscherProfile
): string {
  const { stateVector } = profile;

  let tuning = {
    pace: 'normal',
    directness: 'balanced',
    validation: 'standard',
    emotionalSupport: 'moderate'
  };

  // High stress → slow pace, high validation
  if (stateVector.stressLevel > 0.7) {
    tuning.pace = 'slow';
    tuning.validation = 'elevated';
    tuning.emotionalSupport = 'high';
  }

  // High autonomy need → respect boundaries
  if (stateVector.autonomyNeed > 0.6) {
    tuning.directness = 'respectful';
    // Avoid "helping" that feels invasive
  }

  // High affiliation need → warm, connecting
  if (stateVector.affiliationNeed > 0.7) {
    tuning.validation = 'elevated';
    tuning.emotionalSupport = 'high';
  }

  // Low stimulation need → gentle, less intense
  if (stateVector.stimulationNeed < 0.3) {
    tuning.pace = 'slow';
    tuning.directness = 'gentle';
  }

  return applyTuning(baseResponse, tuning);
}

function applyTuning(text: string, tuning: any): string {
  // Inject tuning guidance into system prompt or post-process
  const guidance = `
Respond with these adjustments:
- Pace: ${tuning.pace}
- Directness: ${tuning.directness}
- Validation level: ${tuning.validation}
- Emotional support: ${tuning.emotionalSupport}
  `;

  return processWithGuidance(text, guidance);
}
```

### Dynamic Re-testing
```typescript
function shouldRequestRetest(user: UserState): boolean {
  const timeSinceLastTest = Date.now() - user.lastTestAt;
  const hoursSince = timeSinceLastTest / (1000 * 60 * 60);

  // After major interactions
  if (hoursSince > 24) return true;

  // After detected state shift
  if (detectedMajorEmotionalShift(user)) return true;

  // Periodic refresh
  if (user.testCount < 3 && hoursSince > 6) return true;

  return false;
}

async function requestRetest() {
  // Casual, game-like framing
  return "Fancy a quick color sort? Curious how you'd arrange them today.";
}
```

## Implementation Steps
1. Build Lüscher calculation + lookup system
2. Design jelly bean React component
3. Create state vector derivation logic
4. Implement empathetic tuning layer
5. Add re-testing triggers
6. Integrate with RCB context
7. Test tone shifts across profiles
8. Validate that profile never shown to user

## Testing Strategy
- A/B test with/without Lüscher tuning
- Measure user satisfaction scores
- Track "felt seen" vs "felt diagnosed" responses
- Validate state vector accuracy against manual coding
- Test profile shift detection

## Success Criteria
- Users report feeling "understood" without feeling "analyzed"
- Tone shifts measurably match state vectors
- Re-test invitations feel natural, not clinical
- Profile history shows meaningful state tracking
- Zero instances of profile data leaked to user
