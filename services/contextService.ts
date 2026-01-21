

// FIX: Update import to use RoleSetting
import type { MemoryAtom, AISettings, RoleSetting } from '../types';
import { generateText, ORBITAL_CONTEXT_MANAGEMENT_PROMPT } from './geminiService';
import { loggingService } from './loggingService';

interface OrbitCommand {
    uuid: string;
    strength: number; // 1-10
}

interface ContextManagementResult {
    setOrbits: OrbitCommand[];
    deorbitUuids: string[];
}

interface ContextItem {
  id: string;
  type: 'file' | 'message';
  content: string;
  tokenSize: number;
}
interface PruneRemoveCommand {
    id: string;
    tokenSize: number;
}

export const CONTEXT_PRUNING_PROMPT = `You are an AI context manager. The context for an upcoming API call has exceeded the token limit of {TOKEN_LIMIT} tokens; it is currently at {CURRENT_TOKENS} tokens. Your critical task is to intelligently prune the context to fit.

The user's immediate query is: "{USER_QUERY}"

Review the list of files and messages currently in context. To reduce the token count, you must decide which items to **REMOVE**. Prioritize removing items least relevant to the user's immediate query and the most recent turns of the conversation. Aim to get the total token count well below the limit.

Respond with a single JSON object in a markdown code block with one key:
1. "remove": An array of objects, each with an "id" (the uuid or filename) and "tokenSize" (the estimated token size of the item). Include ONLY the items to be removed.

[CURRENT CONTEXT ITEMS]
---
{CONTEXT_ITEMS}
---
`;

class ContextService {
    /**
     * Assign a tier to a MemoryAtom based on its metadata and current turn.
     */
    assignTier(item: import('../types').MemoryAtom, currentTurn: number): 'hot' | 'warm' | 'cold' {
        // Critical safety/identity overrides (case-insensitive checks)
        const ax = (item.axiomId || '').toString().toLowerCase();
        if ((ax && (ax.includes('fixit') || ax.includes('benevolent'))) ||
                (item.type === 'user_message' && typeof item.lastActivatedTurn === 'number' && item.lastActivatedTurn >= currentTurn - 2)) {
            return 'hot';
        }

        // High-activation heuristics
        if ((typeof item.intrinsicValue === 'number' && item.intrinsicValue > 0.7) ||
                (typeof item.orbitalStrength === 'number' && item.orbitalStrength >= 8) ||
                (typeof item.lastActivationScore === 'number' && item.lastActivationScore > 0.6)) {
            return 'hot';
        }

        // Warm bucket
        if ((typeof item.intrinsicValue === 'number' && item.intrinsicValue > 0.4) ||
                (typeof item.orbitalStrength === 'number' && item.orbitalStrength >= 5)) {
            return 'warm';
        }

        // Cold by default
        return 'cold';
    }

    /**
     * Compute restoration priority used for sorting items when filling context budgets.
     */
    computeRestorationPriority(item: import('../types').MemoryAtom, currentTurn: number): number {
        let priority = (typeof item.intrinsicValue === 'number' ? item.intrinsicValue : 0) * 100;

        if (typeof item.lastActivatedTurn === 'number' && item.lastActivatedTurn >= currentTurn - 5) {
            priority += 50;
        }

        if (item.axiomId && (item.axiomId.startsWith('identity.') || item.axiomId.startsWith('mission.'))) {
            priority += 100;
        }

        const age = currentTurn - (item.timestamp || 0);
        // If the item was recently activated, prefer recency bonus and skip age penalty
        if (age > 100 && !(typeof item.lastActivatedTurn === 'number' && item.lastActivatedTurn >= currentTurn - 5)) {
            priority -= Math.log(age) * 5;
        }

        return priority;
    }
  // FIX: Changed signature from WorkflowStage to RoleSetting
  async manageOrbits(allMessages: MemoryAtom[], roleSetting: RoleSetting, providers: AISettings['providers']): Promise<ContextManagementResult> {
    const result: ContextManagementResult = { setOrbits: [], deorbitUuids: [] };
    if (!roleSetting.enabled || !roleSetting.selectedModel) {
        return result;
    }
    loggingService.log('DEBUG', 'Context orbit management cycle started.');

    const contextWorthyTypes: MemoryAtom['type'][] = ['axiom', 'steward_note', 'user_message', 'model_response'];
    
    const newArtifacts = allMessages.filter(m =>
        contextWorthyTypes.includes(m.type) && typeof m.orbitalDecayTurns === 'undefined'
    );

    const expiringArtifacts = allMessages.filter(m =>
        m.isInContext && contextWorthyTypes.includes(m.type) && m.orbitalDecayTurns === 1
    );

    const stableArtifacts = allMessages.filter(m =>
        m.isInContext && contextWorthyTypes.includes(m.type) && m.orbitalDecayTurns && m.orbitalDecayTurns > 1
    );
    const stableArtifactsSample = stableArtifacts.sort(() => 0.5 - Math.random()).slice(0, 10);


    if (newArtifacts.length === 0 && expiringArtifacts.length === 0 && stableArtifactsSample.length === 0) {
        loggingService.log('DEBUG', 'No new, expiring, or sampled artifacts to manage.');
        return result;
    }
    
    loggingService.log('DEBUG', 'Found artifacts to manage.', { newCount: newArtifacts.length, expiringCount: expiringArtifacts.length, stableSampleCount: stableArtifactsSample.length });
    
    const conversationHistory = allMessages
        .filter(m => m.type === 'user_message' || m.type === 'model_response')
        .slice(-8)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
        .join('\n\n');
        
    const newArtifactsString = newArtifacts.map(a => `- UUID: ${a.uuid}\n  - Type: ${a.type}\n  - Content: ${a.text}`).join('\n');
    const expiringArtifactsString = expiringArtifacts.map(a => `- UUID: ${a.uuid}\n  - Type: ${a.type}\n  - Content: ${a.text}`).join('\n');
    const stableArtifactsString = stableArtifactsSample.map(a => `- UUID: ${a.uuid}\n  - Type: ${a.type}\n  - Content: ${a.text}`).join('\n');


    let prompt = ORBITAL_CONTEXT_MANAGEMENT_PROMPT;
    prompt = prompt.replace('{CONTEXT}', conversationHistory || 'No recent conversation.');
    prompt = prompt.replace('{NEW_ARTIFACTS}', newArtifactsString || 'None.');
    prompt = prompt.replace('{EXPIRING_ARTIFACTS}', expiringArtifactsString || 'None.');
    prompt = prompt.replace('{STABLE_ARTIFACTS}', stableArtifactsString || 'None.');
    prompt = prompt.replace('{CURRENT_DATETIME}', new Date().toISOString());
    
    try {
        const responseJson = await generateText(prompt, '', roleSetting, providers);
        
        // Robust fence extraction (handles trailing commentary)
        let candidate = String(responseJson).trim();
        const fencedMatch = candidate.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fencedMatch) {
            candidate = fencedMatch[1].trim();
        } else {
            const jsonMatch = candidate.match(/(\[[\s\S]*\])|(\{[\s\S]*\})/);
            if (jsonMatch) {
                candidate = jsonMatch[0];
            }
        }
        const parsedResponse = JSON.parse(candidate);

        if (parsedResponse.setOrbits && Array.isArray(parsedResponse.setOrbits)) {
            result.setOrbits = parsedResponse.setOrbits.filter(
                (cmd: any): cmd is OrbitCommand => 
                    typeof cmd.uuid === 'string' && typeof cmd.strength === 'number'
            );
        }

        if (parsedResponse.deorbitUuids && Array.isArray(parsedResponse.deorbitUuids)) {
            result.deorbitUuids = parsedResponse.deorbitUuids.filter(
                (id: any): id is string => typeof id === 'string'
            );
        }
        
        loggingService.log('INFO', 'Context orbit management successful.', { result });
        return result;

    } catch(e: any) {
        const errorDetails = { message: e?.message, name: e?.name, stack: e?.stack, raw: String(e), type: typeof e };
        loggingService.log('ERROR', 'Failed to manage context orbits. Applying fallback.', { error: errorDetails });
        result.setOrbits = newArtifacts.map(a => ({ uuid: a.uuid, strength: 5 }));
        return result;
    }
  }

  // FIX: Changed signature from WorkflowStage to RoleSetting
  async pruneContextForOverflow(
    userQuery: string,
    contextItems: ContextItem[],
    currentTokenCount: number,
    tokenLimit: number,
    roleSetting: RoleSetting,
    providers: AISettings['providers']
  ): Promise<PruneRemoveCommand[]> {
    if (!roleSetting.enabled || !roleSetting.selectedModel) {
        loggingService.log('WARN', 'Context pruning skipped: stage is disabled or no model selected.');
        return [];
    }

    const itemsString = contextItems.map(item => 
        `- ID: ${item.id}\n  - Type: ${item.type}\n  - Tokens: ${item.tokenSize}\n  - Content Preview: ${item.content.substring(0, 200)}...`
    ).join('\n');
    
    let prompt = CONTEXT_PRUNING_PROMPT;
    prompt = prompt.replace('{TOKEN_LIMIT}', tokenLimit.toLocaleString());
    prompt = prompt.replace('{CURRENT_TOKENS}', currentTokenCount.toLocaleString());
    prompt = prompt.replace('{USER_QUERY}', userQuery);
    prompt = prompt.replace('{CONTEXT_ITEMS}', itemsString);
    loggingService.log('DEBUG', 'Requesting context pruning from AI.');
    try {
        const responseJson = await generateText(prompt, '', roleSetting, providers);
        const parsedResponse = JSON.parse(responseJson.trim().replace(/```json|```/g, ''));

        if (parsedResponse.remove && Array.isArray(parsedResponse.remove)) {
            const itemsToRemove = parsedResponse.remove.filter(
                (item: any): item is PruneRemoveCommand => 
                    typeof item.id === 'string' && typeof item.tokenSize === 'number'
            );
            loggingService.log('INFO', 'AI recommended items to prune from context.', { itemsToRemove });
            return itemsToRemove;
        }
        return [];
    } catch(e) {
        loggingService.log('ERROR', 'Failed to prune context via AI.', { error: e });
        return [];
    }
  }
}

export const contextService = new ContextService();
