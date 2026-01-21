import type { DualProcessConfig, ScratchpadEntry, DistilledInsight } from '../types/dualProcess';
import { scratchpadService } from './scratchpad';
import { generateText } from './geminiService';
import type { RoleSetting, AISettings } from '../types';

class DualProcessEngine {
    private config: DualProcessConfig;
    private generatorWins = 0;
    private refinerWins = 0;
    private iterations = 0;

    constructor(config: Partial<DualProcessConfig> = {}) {
        this.config = {
            maxIterations: config.maxIterations || 50,
            ontologyThreshold: config.ontologyThreshold || 0.30,
            fairnessWindow: config.fairnessWindow || 5,
            enableContextDiffer: config.enableContextDiffer !== false,
            scratchpadPersistence: config.scratchpadPersistence || 'indexeddb',
            hudRefreshInterval: config.hudRefreshInterval || 1000
        };
    }

    /**
     * Generator proposes action
     */
    async generateProposal(
        context: string,
        actionType: ScratchpadEntry['actionType'],
        roleSetting: RoleSetting,
        providers: AISettings['providers'],
        systemPromptOverride?: string
    ): Promise<string> {
        const history = await scratchpadService.getRecentEntries(10);
        const historyText = history.map(e => `[${e.role}] ${e.content}`).join('\n');

        // Use override if provided, otherwise default internal prompt
        const prompt = systemPromptOverride
            ? `${systemPromptOverride}\n\nRECENT DEBATE HISTORY:\n${historyText}\n\nCURRENT TASK: ${actionType}\nCONTEXT: ${context}`
            : `You are the GENERATOR in a dual-process cognitive engine.

RECENT DEBATE HISTORY:
${historyText}

CURRENT TASK: ${actionType}
CONTEXT: ${context}

Your role is to PROPOSE, EXPAND, and CREATE. Generate a proposal for the current task.
Be bold but grounded. Propose concrete actions or insights.

Respond with your proposal:`;

        const response = await generateText(prompt, roleSetting, providers);

        await scratchpadService.append('GENERATOR', response, actionType, 'LOW');
        this.generatorWins++;

        return response;
    }

    /**
     * Refiner critiques and compresses
     */
    async refineProposal(
        proposal: string,
        actionType: ScratchpadEntry['actionType'],
        roleSetting: RoleSetting,
        providers: AISettings['providers'],
        targetLength?: number,
        systemPromptOverride?: string
    ): Promise<string> {
        const history = await scratchpadService.getRecentEntries(10);
        const historyText = history.map(e => `[${e.role}] ${e.content}`).join('\n');

        const lengthConstraint = targetLength
            ? `\n\nIMPORTANT: Your response must be under ${targetLength} characters.`
            : '';

        const prompt = systemPromptOverride
            ? `${systemPromptOverride}\n\nRECENT DEBATE HISTORY:\n${historyText}\n\nGENERATOR'S PROPOSAL:\n${proposal}\n\nTASK: ${actionType}${lengthConstraint}`
            : `You are the REFINER in a dual-process cognitive engine.

RECENT DEBATE HISTORY:
${historyText}

GENERATOR'S PROPOSAL:
${proposal}

TASK: ${actionType}

Your role is to CRITIQUE, CONSOLIDATE, and STABILIZE. Review the Generator's proposal.
- If it's sound, compress it to its essence
- If it's flawed, identify issues and propose corrections
- Always aim for clarity and precision${lengthConstraint}

Respond with your refined version:`;

        const response = await generateText(prompt, roleSetting, providers);

        await scratchpadService.append('REFINER', response, actionType, 'HIGH');
        this.refinerWins++;

        return response;
    }

    /**
     * Distill a background insight
     */
    async distillInsight(
        rawInsight: { query: string; insight: string; sources: any[] },
        roleSetting: RoleSetting, // Fallback/Global role setting (not used for specific stages if workflow exists)
        providers: AISettings['providers'],
        backgroundWorkflow?: import('../types').WorkflowStage[] // Optional, passed from service
    ): Promise<DistilledInsight> {

        // Find specific generator/refiner stages if they exist
        const generatorStage = backgroundWorkflow?.find(s => s.name.toLowerCase().includes('generator')) ||
            backgroundWorkflow?.[0]; // Fallback to first if named differently

        const refinerStage = backgroundWorkflow?.find(s => s.name.toLowerCase().includes('refiner')) ||
            backgroundWorkflow?.[1]; // Fallback to second

        // Prepare Generator Prompt - Use configured system prompt + context
        // If no stage found, falls back to internal default (via logic in generateProposal if I updated it, but here I'll construct the call)

        const generatorPrompt = generatorStage
            ? `${generatorStage.systemPrompt}\n\nTask: Distill knowledge\nQuery: "${rawInsight.query}"\n\nRaw content (first 10k chars):\n${rawInsight.insight.substring(0, 10000)}`
            : `Query: "${rawInsight.query}"\n\nRaw content (first 10k chars):\n${rawInsight.insight.substring(0, 10000)}`;

        const generatorRole: RoleSetting = generatorStage
            ? { enabled: true, provider: generatorStage.provider, selectedModel: generatorStage.selectedModel }
            : roleSetting; // Fallback

        // Generator proposes key facts
        const proposal = await this.generateProposal(
            generatorPrompt,
            'DISTILL',
            generatorRole,
            providers
        );

        // Prepare Refiner Prompt
        const refinerPrompt = refinerStage
            ? `${refinerStage.systemPrompt}\n\nGENERATOR'S PROPOSAL:\n${proposal}`
            : proposal; // If no stage, refinerProposal internal prompt handles the context

        // If stage exists, we pass an EMPTY string as the "proposal" arg because we baked it into the prompt above? 
        // No, refineProposal expects `proposal` separately to construct its own prompt.
        // Wait, `refineProposal` hardcodes the prompt structure: "You are the REFINER...".
        // I need to update `refineProposal` to allow overriding the prompt if a stage is provided.

        // Actually, simplest is to update generate/refineProposal to take an optional `systemPromptOverride`.

        const refinerRole: RoleSetting = refinerStage
            ? { enabled: true, provider: refinerStage.provider, selectedModel: refinerStage.selectedModel }
            : roleSetting;

        // Refiner compresses to 500 chars
        const distilled = await this.refineProposal(
            proposal,
            'COMPRESS',
            refinerRole,
            providers,
            500,
            refinerStage?.systemPrompt // Pass system prompt override if available
        );

        return {
            query: rawInsight.query,
            distilledChunk: distilled,
            confidence: 0.85,
            sources: rawInsight.sources,
            originalLength: rawInsight.insight.length,
            compressedLength: distilled.length,
            timestamp: Date.now()
        };
    }

    /**
     * Check if fairness is violated
     */
    private checkFairness(): boolean {
        // If one force has dominated for too long, boost the other
        if (this.generatorWins >= this.config.fairnessWindow) {
            this.refinerWins += 2; // Boost refiner
            this.generatorWins = 0;
            return false;
        }

        if (this.refinerWins >= this.config.fairnessWindow) {
            this.generatorWins += 2; // Boost generator
            this.refinerWins = 0;
            return false;
        }

        return true;
    }

    /**
     * Main inescapable loop (for future use)
     */
    async runInescapableLoop(
        initialContext: string,
        roleSetting: RoleSetting,
        providers: AISettings['providers']
    ): Promise<void> {
        await scratchpadService.append('SYSTEM', `Starting inescapable loop with context: ${initialContext}`, 'OBSERVE');

        while (this.iterations < this.config.maxIterations) {
            // Check fairness
            this.checkFairness();

            // Generator proposes
            const proposal = await this.generateProposal(
                initialContext,
                'OBSERVE',
                roleSetting,
                providers
            );

            // Refiner critiques
            await this.refineProposal(
                proposal,
                'OBSERVE',
                roleSetting,
                providers
            );

            this.iterations++;

            // External stop conditions only
            // (completion promise, ontological drift, etc. - to be implemented)
        }
    }
}

export const dualProcessEngine = new DualProcessEngine();
