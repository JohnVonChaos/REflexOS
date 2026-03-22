import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CloseIcon } from './icons/index';
import { ralphCalibrationService, ModelCalibration, ROLE_CALIBRATION_TASKS } from '../services/ralphCalibrationService';
import { generateText } from '../services/geminiService';
import { AISettings } from '../types';

const MAX_ATTEMPTS = 5;
const MIN_PASS_RATE = 60; // % of training variations the regex must match

interface CalibrationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  modelName: string;
  role?: string;
  roleSystemPrompt?: string;
  settings: AISettings;
  onCalibrationComplete?: (calibration: ModelCalibration) => void;
}

interface CommandResult {
  commandType: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  attempts: number;
  patternStr: string | null;
  passRate: number;
  catches: string;
  misses: string;
  failureLog: string[];
  variations?: string[];
}

type WizardPhase = 'idle' | 'running' | 'complete';

export const CalibrationWizardModal: React.FC<CalibrationWizardModalProps> = ({
  isOpen,
  onClose,
  modelId,
  modelName,
  role = 'background',
  roleSystemPrompt,
  settings,
  onCalibrationComplete,
}) => {
  const [phase, setPhase] = useState<WizardPhase>('idle');
  const [results, setResults] = useState<CommandResult[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const abortRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    abortRef.current = false;
    setPhase('idle');
    setStatusMsg('');
    const req = ralphCalibrationService.buildCalibrationRequest(modelId, modelName, role);
    setResults(
      req.commandTypes.map(ct => ({
        commandType: ct.type,
        label: ct.label,
        status: 'pending',
        attempts: 0,
        patternStr: null,
        passRate: 0,
        catches: '',
        misses: '',
        failureLog: [],
      }))
    );
  }, [isOpen, modelId, modelName, role]);

  const updateResult = useCallback((idx: number, patch: Partial<CommandResult>) => {
    setResults(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const getRoleConfig = () =>
    settings.roles?.background || {
      enabled: true,
      provider: 'gemini' as const,
      selectedModel: 'gemini-2.5-flash',
    };

  const callWithTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    const timeout = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s`)), ms)
    );
    return Promise.race([promise, timeout]);
  };

  const collectVariations = async (
    commandType: { type: string; label: string; prompts: string[] }
  ): Promise<string[]> => {
    const roleConfig = getRoleConfig();
    const sysPrompt =
      roleSystemPrompt ||
      `You are the background cognition agent of the REflexOS system. Respond naturally in your role.`;
    const responses: string[] = [];

    for (const prompt of commandType.prompts) {
      if (abortRef.current) break;
      try {
        const response = await callWithTimeout(
          generateText(prompt, sysPrompt, roleConfig, settings.providers),
          30000
        );
        responses.push(response);
      } catch (e) {
        responses.push(`[ERROR] ${(e as Error).message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return responses;
  };

  const askRalphForPattern = async (
    commandType: string,
    label: string,
    variations: string[],
    prompts: string[],
    failureReport: string | null
  ): Promise<string> => {
    const detailedVariations = variations
      .map((v, i) => `PROMPT ${i + 1}: ${prompts[i]}\nRESPONSE ${i + 1}: ${v}`)
      .join('\n\n');

    const retrySection = failureReport
      ? `\n\nPREVIOUS ATTEMPT FAILED:\n${failureReport}\n\nPlease correct the pattern based on this failure report.\n`
      : '';

    const analysisPrompt = `You are a regex expert. Analyze these model responses to build a recognition pattern.\n\nCOMMAND TYPE: ${commandType}\nDESCRIPTION: ${label}\n${retrySection}\nMODEL RESPONSES (with the prompts that triggered them):\n${detailedVariations}\n\nYour job: write a JavaScript regex that would match these responses when this command type is being expressed.\n\nRules:\n1. Look for consistent structural markers across ALL responses\n2. Make it flexible - capture the PATTERN, not exact values\n3. Must be valid JavaScript regex syntax with flags\n4. Better to over-match than under-match\n5. Output EXACTLY this format - nothing else:\n\nPATTERN: /your-regex/gi\nCATCHES: one line description\nMISSES: what edge cases might slip through`;

    const bgRole = getRoleConfig();
    const result = await callWithTimeout(
      generateText(
        analysisPrompt,
        'You are an expert regex analyst. Output only the requested format with no preamble.',
        bgRole,
        settings.providers
      ),
      45000
    );
    return result;
  };

  const testPattern = (
    patternStr: string,
    variations: string[]
  ): { passRate: number; failures: string[] } => {
    try {
      let passes = 0;
      const failures: string[] = [];
      for (const v of variations) {
        const regex = new RegExp(patternStr, 'gi');
        if (regex.test(v)) {
          passes++;
        } else {
          failures.push(v.substring(0, 120));
        }
      }
      return { passRate: (passes / variations.length) * 100, failures };
    } catch (e) {
      return { passRate: 0, failures: [`Invalid regex: ${(e as Error).message}`] };
    }
  };

  const calibrateCommandType = async (
    idx: number,
    commandType: { type: string; label: string; prompts: string[] }
  ): Promise<void> => {
    updateResult(idx, { status: 'running' });
    setStatusMsg(`Collecting responses for: ${commandType.label}...`);

    const variations = await collectVariations(commandType);
    if (abortRef.current) return;
    updateResult(idx, { variations });

    let failureReport: string | null = null;
    const failureLog: string[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (abortRef.current) return;

      setStatusMsg(`${commandType.label} - Attempt ${attempt}/${MAX_ATTEMPTS}: asking Ralph for pattern...`);
      updateResult(idx, { attempts: attempt });

      try {
        const ralphOutput = await askRalphForPattern(
          commandType.type,
          commandType.label,
          variations,
          commandType.prompts,
          failureReport
        );

        const parsed = ralphCalibrationService.parseRalphAnalysis(ralphOutput);

        if (!parsed.pattern) {
          const failMsg = `Attempt ${attempt}: No valid /regex/flags found. Raw: "${ralphOutput.substring(0, 200)}"`;
          failureLog.push(failMsg);
          failureReport = `Pattern parsing failed - no /regex/flags found in Ralph's output.\nRaw output:\n${ralphOutput.substring(0, 400)}\n\nYou MUST output a line in exactly this format:\nPATTERN: /your-regex/gi`;
          updateResult(idx, { failureLog: [...failureLog] });
          await new Promise(r => setTimeout(r, 800));
          continue;
        }

        const patternStr = parsed.pattern.source;
        setStatusMsg(`${commandType.label} - Attempt ${attempt}: testing pattern...`);

        const { passRate, failures } = testPattern(patternStr, variations);

        if (passRate >= MIN_PASS_RATE) {
          updateResult(idx, {
            status: 'success',
            patternStr,
            passRate,
            catches: parsed.catches,
            misses: parsed.misses,
            failureLog,
          });
          return;
        }

        const failMsg = `Attempt ${attempt}: Pattern /${patternStr}/ matched only ${passRate.toFixed(0)}% (need ${MIN_PASS_RATE}%)`;
        failureLog.push(failMsg);
        failureReport = `The pattern you provided was tested and FAILED.\n\nPattern tried: /${patternStr}/gi\nPass rate: ${passRate.toFixed(0)}% (minimum required: ${MIN_PASS_RATE}%)\n\nResponses that did NOT match:\n${failures.map((f, i) => `${i + 1}. "${f}"`).join('\n')}\n\nThe pattern must be broadened to catch these. Provide a corrected pattern.`;

        updateResult(idx, {
          patternStr,
          passRate,
          catches: parsed.catches,
          misses: parsed.misses,
          failureLog: [...failureLog],
        });
      } catch (e) {
        const failMsg = `Attempt ${attempt}: Error - ${(e as Error).message}`;
        failureLog.push(failMsg);
        failureReport = `API error on attempt ${attempt}: ${(e as Error).message}. Please try again.`;
        updateResult(idx, { failureLog: [...failureLog] });
      }

      await new Promise(r => setTimeout(r, 1200));
    }

    updateResult(idx, { status: 'failed', failureLog });
  };

  const startCalibration = async () => {
    abortRef.current = false;
    setPhase('running');
    const req = ralphCalibrationService.buildCalibrationRequest(modelId, modelName, role);

    for (let i = 0; i < req.commandTypes.length; i++) {
      if (abortRef.current) break;
      await calibrateCommandType(i, req.commandTypes[i]);
    }

    setStatusMsg('');
    setPhase('complete');
  };

  const retryOne = async (idx: number) => {
    const req = ralphCalibrationService.buildCalibrationRequest(modelId, modelName, role);
    const ct = req.commandTypes[idx];
    if (!ct) return;

    updateResult(idx, {
      status: 'pending',
      attempts: 0,
      patternStr: null,
      passRate: 0,
      failureLog: [],
    });

    setPhase('running');
    await calibrateCommandType(idx, ct);
    setPhase('complete');
  };

  const saveCalibration = () => {
    const patterns: Record<string, RegExp> = {};
    let totalPassRate = 0;
    let patternCount = 0;

    for (const result of results) {
      if (result.patternStr) {
        try {
          patterns[result.commandType] = new RegExp(result.patternStr, 'gi');
          totalPassRate += result.passRate;
          patternCount++;
        } catch {
          // skip
        }
      }
    }

    const defaultCal = ralphCalibrationService.buildDefaultCalibration(modelId);
    const mergedPatterns = { ...defaultCal.patterns, ...patterns };
    const avgPassRate = patternCount > 0 ? totalPassRate / patternCount : 0;

    const calibration: ModelCalibration = {
      modelId,
      calibratedAt: Date.now(),
      patterns: mergedPatterns as ModelCalibration['patterns'],
      verificationPassRate: avgPassRate,
      citationCount: defaultCal.citationCount,
    };

    ralphCalibrationService.saveCalibration(calibration);
    onCalibrationComplete?.(calibration);
    onClose();
  };

  if (!isOpen) return null;

  const roleTasks = ROLE_CALIBRATION_TASKS[role] || ROLE_CALIBRATION_TASKS['background'];
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const pendingCount = results.filter(r => r.status === 'pending').length;

  const statusIcon = (status: CommandResult['status']) => {
    if (status === 'success') return '✅';
    if (status === 'failed') return '❌';
    if (status === 'running') return '⏳';
    return '○';
  };

  const passRateColor = (rate: number) => {
    if (rate >= 80) return 'text-green-400';
    if (rate >= MIN_PASS_RATE) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-gray-900 rounded-lg w-11/12 max-w-3xl max-h-[90vh] overflow-y-auto my-8">

        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Model Calibration</h2>
            <p className="text-sm text-gray-400">
              {modelName} {'->'} <span className="text-cyan-400">{roleTasks.roleLabel}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <CloseIcon />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {phase === 'idle' && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                <h3 className="text-white font-semibold">What this does</h3>
                <p className="text-sm text-gray-400">
                  Sends <strong className="text-white">{results.length} task type{results.length !== 1 ? 's' : ''}</strong> to{' '}
                  <strong className="text-white">{modelName}</strong> using the{' '}
                  <strong className="text-cyan-400">{roleTasks.roleLabel}</strong> system prompt.
                  Observes how it naturally responds in that role, then derives regex patterns to parse those outputs at runtime.
                </p>
                <p className="text-sm text-gray-500">
                  Up to {MAX_ATTEMPTS} attempts per task. Failed patterns are fed back with a failure report so they can be corrected.
                </p>
                <div className="border-t border-gray-700 pt-3 space-y-1">
                  {results.map((r, i) => (
                    <div key={i} className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-600 inline-block flex-shrink-0" />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={startCalibration}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition text-lg"
              >
                Start Calibration
              </button>
            </div>
          )}

          {phase === 'running' && (
            <div className="space-y-4">
              {statusMsg && (
                <div className="text-sm text-cyan-400 bg-cyan-950/40 border border-cyan-900 rounded px-3 py-2 animate-pulse">
                  {statusMsg}
                </div>
              )}
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg p-3 border transition-colors ${
                      result.status === 'running'
                        ? 'border-blue-600 bg-blue-950/30'
                        : result.status === 'success'
                        ? 'border-green-700 bg-green-950/20'
                        : result.status === 'failed'
                        ? 'border-red-700 bg-red-950/20'
                        : 'border-gray-700 bg-gray-800/40'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{statusIcon(result.status)}</span>
                        <span className="text-sm text-white">{result.label}</span>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-3">
                        {result.attempts > 0 && (
                          <span>attempt {result.attempts}/{MAX_ATTEMPTS}</span>
                        )}
                        {result.patternStr && (
                          <span className={passRateColor(result.passRate)}>
                            {result.passRate.toFixed(0)}% match
                          </span>
                        )}
                      </div>
                    </div>
                    {result.status === 'running' && (
                      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 animate-pulse w-full" />
                      </div>
                    )}
                    {result.patternStr && result.status === 'running' && (
                      <code className="text-xs text-gray-500 font-mono block mt-1 truncate">
                        /{result.patternStr}/gi
                      </code>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => { abortRef.current = true; }}
                className="text-xs text-gray-600 hover:text-red-400 transition mt-1"
              >
                Cancel
              </button>
            </div>
          )}

          {phase === 'complete' && (
            <div className="space-y-4">
              <div className="flex gap-5 text-sm">
                <span className="text-green-400 font-medium">✅ {successCount} succeeded</span>
                {failedCount > 0 && (
                  <span className="text-red-400 font-medium">❌ {failedCount} failed</span>
                )}
                {pendingCount > 0 && (
                  <span className="text-gray-500">○ {pendingCount} skipped</span>
                )}
              </div>

              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border ${
                      result.status === 'success'
                        ? 'border-green-700 bg-green-950/20'
                        : result.status === 'failed'
                        ? 'border-red-700 bg-red-950/20'
                        : 'border-gray-700 bg-gray-800/40'
                    }`}
                  >
                    <div className="p-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{statusIcon(result.status)}</span>
                          <span className="text-sm text-white font-medium">{result.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {result.patternStr && (
                            <span className={`text-xs font-bold ${passRateColor(result.passRate)}`}>
                              {result.passRate.toFixed(0)}%
                            </span>
                          )}
                          {result.status === 'failed' && (
                            <button
                              onClick={() => retryOne(idx)}
                              className="text-xs bg-orange-700 hover:bg-orange-600 text-white px-2 py-1 rounded transition"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                      {result.patternStr && (
                        <div className="mt-2">
                          <code className="text-xs text-green-400 font-mono block truncate">
                            /{result.patternStr}/gi
                          </code>
                          {result.catches && (
                            <p className="text-xs text-gray-500 mt-1">{String.fromCharCode(8627)} {result.catches}</p>
                          )}
                        </div>
                      )}
                      {result.status === 'failed' && result.failureLog.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300 select-none">
                            {result.attempts} attempt{result.attempts !== 1 ? 's' : ''} failed — view log
                          </summary>
                          <div className="mt-2 space-y-1 pl-3 border-l border-red-900/50">
                            {result.failureLog.map((log, li) => (
                              <p key={li} className="text-xs text-gray-500">{log}</p>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {failedCount > 0 && (
                <div className="bg-yellow-950/40 border border-yellow-800 rounded p-3 text-sm text-yellow-400">
                  {failedCount} task type{failedCount !== 1 ? 's' : ''} could not be calibrated after {MAX_ATTEMPTS} attempts.
                  Default fallback patterns will be used. You can retry above or swap the model.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 p-4 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
          >
            {phase === 'complete' ? 'Discard' : 'Cancel'}
          </button>
          {phase === 'complete' && (
            <button
              onClick={saveCalibration}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition"
            >
              Save Calibration
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
