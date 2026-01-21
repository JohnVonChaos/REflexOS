

import type { MemoryAtom, RunningContextBuffer, RoleSetting, AISettings } from '../types';
import { generateText, CONSCIOUS_REFLECTION_PROMPT } from './geminiService';
import { loggingService } from './loggingService';

// FIX: Added `plan_of_action` to the type and calculation.
export const calculateRcbSize = (rcbData: {
    conscious_focal_points: string[];
    current_mission_state: string;
    interaction_history_abstract: string;
    constraint_reminders: string[];
    plan_of_action: string[];
}): number => {
    const focalPointsSize = rcbData.conscious_focal_points.join('\n').length;
    const missionStateSize = rcbData.current_mission_state.length;
    const historyAbstractSize = rcbData.interaction_history_abstract.length;
    const constraintsSize = rcbData.constraint_reminders.join('\n').length;
    const planSize = rcbData.plan_of_action.join('\n').length;
    return focalPointsSize + missionStateSize + historyAbstractSize + constraintsSize + planSize;
}

class RcbService {
  // FIX: Rewrote update logic to use the comprehensive JSON-based prompt.
  async updateRcb(
    lastTurnAtoms: MemoryAtom[],
    currentRcb: RunningContextBuffer,
    roleSetting: RoleSetting,
    providers: AISettings['providers'],
    aiSettings?: any
  ): Promise<RunningContextBuffer> {
    if (lastTurnAtoms.length < 2) {
      return currentRcb;
    }
    const lastUserAtom = lastTurnAtoms[0];
    const lastModelAtom = lastTurnAtoms[1];

    // Include the AI's internal cognitive trace in the context for a richer reflection
    const cognitiveTraceText = lastModelAtom.cognitiveTrace
        ?.map(trace => `[${trace.type}] ${trace.text}`)
        .join('\n') || 'No internal monologue for this turn.';

    const turnContext = `User: ${lastUserAtom.text}\n\nAI Internals:\n${cognitiveTraceText}\n\nAI Final Response: ${lastModelAtom.text}`;
    loggingService.log('DEBUG', 'Updating RCB based on last turn.');

    try {
        let prompt = CONSCIOUS_REFLECTION_PROMPT.replace('{CURRENT_DATETIME}', new Date().toString());
        prompt = prompt.replace('{TURN_CONTEXT}', turnContext);
        prompt = prompt.replace('{CURRENT_RCB}', JSON.stringify(currentRcb, null, 2));

        const responseJson = await generateText(
            '', // Prompt is now fully in the system instruction
            prompt, 
            roleSetting, 
            providers
        );

        // Robust fence extraction (handles trailing commentary)
        let candidate = responseJson.trim();
        const fencedMatch = candidate.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fencedMatch) {
            candidate = fencedMatch[1].trim();
        } else {
            // Pattern fallback for un-fenced JSON
            const jsonMatch = candidate.match(/(\[[\s\S]*\])|(\{[\s\S]*\})/);
            if (jsonMatch) {
                candidate = jsonMatch[0];
            }
        }
        const parsedResponse = JSON.parse(candidate);
        
        const newRcb: RunningContextBuffer = {
            ...currentRcb,
            plan_of_action: parsedResponse.plan_of_action ?? currentRcb.plan_of_action,
            conscious_focal_points: parsedResponse.conscious_focal_points ?? currentRcb.conscious_focal_points,
            current_mission_state: parsedResponse.current_mission_state ?? currentRcb.current_mission_state,
            constraint_reminders: parsedResponse.constraint_reminders ?? currentRcb.constraint_reminders,
            lastUpdatedAt: Date.now(),
        };

        // Inject emotional_state.luscher when a workflow has a lastLuscher configured
        try {
          const workflow = aiSettings?.workflow || [];
          const stageWithLuscher = workflow.find((s: any) => s.useLuscherIntake && s.lastLuscher);
          if (stageWithLuscher && stageWithLuscher.lastLuscher) {
            (newRcb as any).emotional_state = (newRcb as any).emotional_state || {};
            (newRcb as any).emotional_state.luscher = stageWithLuscher.lastLuscher;
            (newRcb as any).emotional_state_summary = (stageWithLuscher.lastLuscher && (typeof stageWithLuscher.lastLuscher === 'object')) ? (() => {
              const seq = (stageWithLuscher.lastLuscher.sequence || []).slice(0,2).join(', ');
              return `User chose ${seq} first; Lüscher profile captured at ${stageWithLuscher.lastLuscher.takenAt}`;
            })() : undefined;
          }
        } catch (e) {
          // non-fatal
          loggingService.log('DEBUG', 'Failed to inject Lüscher into RCB', { error: e });
        }

        newRcb.size_current = calculateRcbSize(newRcb);

        // Simple warning system
        newRcb.warnings = newRcb.warnings.filter(w => Date.now() - w.timestamp < 60000); // Clear old warnings

        if (newRcb.size_limit > 0) {
            const usagePercentage = (newRcb.size_current / newRcb.size_limit) * 100;
            if (usagePercentage > 100) {
                newRcb.warnings.push({ timestamp: Date.now(), type: 'exceeded_limit' });
                loggingService.log('WARN', 'RCB size has exceeded its limit.', { current: newRcb.size_current, limit: newRcb.size_limit });
            } else if (usagePercentage > 90) {
                newRcb.warnings.push({ timestamp: Date.now(), type: 'approaching_limit' });
            }
        }
        
        loggingService.log('INFO', 'RCB update successful.', { update: parsedResponse });
        return newRcb;

    } catch (error: any) {
        const errorDetails = { message: error?.message, name: error?.name, stack: error?.stack, raw: String(error), type: typeof error };
        loggingService.log('WARN', 'RCB reflection LLM failed; returning minimal RCB update.', { error: errorDetails });
        // Fallback: return a minimal RCB update that at least records turn times
        try {
          const fallback: RunningContextBuffer = {
            ...currentRcb,
            timestamp: lastModelAtom.timestamp || currentRcb.timestamp,
            lastUpdatedAt: Date.now(),
          } as any;

          // If timestamp diverges significantly from system time, add a warning and set resonanceAnchor
          if (Math.abs((fallback.timestamp || 0) - Date.now()) > 365 * 24 * 60 * 60 * 1000) {
            fallback.warnings = [...(fallback.warnings || []), { timestamp: Date.now(), type: 'time_divergence' } as any];
            (fallback as any).resonanceAnchor = fallback.timestamp;
            (fallback as any).lastTurnSystemTime = Date.now();
          } else {
            (fallback as any).lastTurnSystemTime = fallback.timestamp;
          }

          return fallback;
        } catch (e) {
          loggingService.log('ERROR', 'RCB fallback failed; returning original RCB.', { error: e });
          return currentRcb;
        }
    }
  }
}

export const rcbService = new RcbService();
