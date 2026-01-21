import { srgService } from './srgService';
import { srgModuleService } from './srgModuleService';
import { generateText } from './geminiService';
import { getDefaultSettings } from '../types';
import { parseModelOutput } from './modelIo';
import { introspectionService } from './introspectionService';
import type { SrgJudgment, SrgView } from '../../types';

export async function runStage(
  stageId: string,
  args: { userInput: string; traceSoFar: string; priorJudgment?: SrgJudgment; taskType?: string },
  workflowStages?: any[] // pass in aiSettings.workflow from caller
) {
  const { userInput, traceSoFar, priorJudgment, taskType } = args;
  // Enforce Lüscher intake gating if the workflow requires it
  if (workflowStages && Array.isArray(workflowStages)) {
    const stage = workflowStages.find(s => s.id === stageId);
    if (stage && stage.useLuscherIntake && !stage.lastLuscher) {
      throw new Error('Luscher intake required but not completed.');
    }
  }
  // 1. get active modules and weights (stage-specific)
  const activeModules = workflowStages
    ? srgModuleService.getActiveModulesForStage(workflowStages, stageId)
    : srgModuleService.getActiveModulesWithWeights(stageId);

  // 2. request SRG view
  const srgView: SrgView = await srgService.getSrgView({
    stageId,
    taskType: taskType || 'general',
    textContext: `${userInput}\n\n${traceSoFar}`,
    priorJudgment,
    activeModules
  });

  // 3. Build prompt: include SRG payload as an appended context marker
  const prompt = `${userInput}\n\n[SRG_VIEW_BEGIN]\n${srgView.payload}\n[SRG_VIEW_END]\n\nTrace so far:\n${traceSoFar}`;
  let effectivePrompt = prompt;

  // If the workflow stage has an attached Lüscher result, inject it into the prompt so the model sees
  if (workflowStages && Array.isArray(workflowStages)) {
    const stageCfg = workflowStages.find(s => s.id === stageId);
    if (stageCfg && stageCfg.lastLuscher) {
      const luscherJson = JSON.stringify(stageCfg.lastLuscher, null, 2);
      const luscherSummary = `Sequence: ${(stageCfg.lastLuscher.sequence || []).slice(0,2).join(', ')} (taken at ${stageCfg.lastLuscher.takenAt})`;
        // Append Lüscher block to prompt
        const promptWithLuscher = `${prompt}\n\n--- LUSCHER_PROFILE ---\n${luscherJson}\n--- LUSCHER_SUMMARY ---\n${luscherSummary}`;
        // Use the prompt with the Lüscher block for model call
        effectivePrompt = promptWithLuscher;
    }
  }

  // 4. call model
  // Use default AI provider settings if none provided
  const defaultProviders = getDefaultSettings().providers;
  const roleSetting = { enabled: true, provider: 'gemini' as any, selectedModel: 'gemini-2.5-flash' };
  const judgmentInstruction = `\n\nAt the end of your reply, output a judgment block in the following exact form (no extra text):\n<SRG_JUDGMENT>JSON</SRG_JUDGMENT>\nWhere JSON matches the SrgJudgment schema: { stageId, modelId, srgViewId, coherence, relevance, confidence, missingConcepts, spuriousConcepts, action }. Do not explain or add commentary.`;
  const raw = await generateText(effectivePrompt + judgmentInstruction, '', roleSetting as any, defaultProviders as any);

  // 5. parse output and extract judgment
  const { content, judgment } = parseModelOutput(raw);

  // If no judgment, synthesize a default ok judgement referencing the view id
  const resolvedJudgment: SrgJudgment = judgment || {
    stageId,
    modelId: 'unknown',
    srgViewId: srgView.id,
    coherence: 1,
    relevance: 1,
    confidence: 1,
    missingConcepts: [],
    spuriousConcepts: [],
    action: 'ok'
  };

  // Persist the judgment for introspection and debugging
  try {
    introspectionService.logJudgment(resolvedJudgment, srgView);
  } catch (e) {
    console.warn('Failed to persist judgment to introspection store:', e);
  }

  return { content, judgment: resolvedJudgment, srgView };
}

export default { runStage };
