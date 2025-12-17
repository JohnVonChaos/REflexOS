


// FIX: Add RoleSetting to imports and remove unused WorkflowStage
import type { MemoryAtom, RunningContextBuffer, AISettings, RoleSetting } from '../types';
import { generateText, CONSCIOUS_REFLECTION_PROMPT } from './geminiService';
import { loggingService } from './loggingService';

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
  async updateRcb(
    lastTurnAtoms: MemoryAtom[],
    currentRcb: RunningContextBuffer,
    // FIX: Changed parameter `stage` from `WorkflowStage` to `roleSetting` with type `RoleSetting`
    roleSetting: RoleSetting,
    providers: AISettings['providers']
  ): Promise<RunningContextBuffer> {
    if (lastTurnAtoms.length < 2) {
      return currentRcb;
    }
    const lastUserAtom = lastTurnAtoms[0];
    const lastModelAtom = lastTurnAtoms[1];

    const cognitiveTraceText = lastModelAtom.cognitiveTrace
        ?.map(trace => `[${trace.type}] ${trace.text}`)
        .join('\n') || 'No internal monologue for this turn.';

    const turnContext = `User: ${lastUserAtom.text}\n\nAI Internals:\n${cognitiveTraceText}\n\nAI Final Response: ${lastModelAtom.text}`;
    loggingService.log('DEBUG', 'Updating RCB based on last turn.');

    try {
        let prompt = CONSCIOUS_REFLECTION_PROMPT.replace('{CURRENT_DATETIME}', new Date().toISOString());
        prompt = prompt.replace('{TURN_CONTEXT}', turnContext);
        prompt = prompt.replace('{CURRENT_RCB}', JSON.stringify(currentRcb, null, 2));

        const responseJson = await generateText(
            '', 
            prompt, 
            // FIX: Pass roleSetting to generateText
            roleSetting, 
            providers
        );

        const parsedResponse = JSON.parse(responseJson.trim().replace(/```json|```/g, ''));
        
        const newRcb: RunningContextBuffer = {
            ...currentRcb,
            plan_of_action: parsedResponse.plan_of_action ?? currentRcb.plan_of_action,
            conscious_focal_points: parsedResponse.conscious_focal_points ?? currentRcb.conscious_focal_points,
            current_mission_state: parsedResponse.current_mission_state ?? currentRcb.current_mission_state,
            constraint_reminders: parsedResponse.constraint_reminders ?? currentRcb.constraint_reminders,
            lastUpdatedAt: Date.now(),
        };

        newRcb.size_current = calculateRcbSize(newRcb);

        newRcb.warnings = newRcb.warnings.filter(w => Date.now() - w.timestamp < 60000);
        
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

    } catch (error) {
      loggingService.log('ERROR', 'RCB Update failed, returning original.', { error });
      return currentRcb;
    }
  }
}

export const rcbService = new RcbService();