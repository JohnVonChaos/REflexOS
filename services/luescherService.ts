import { ColorId } from '../jelly/types';
import { srgStorage } from './srgStorage';

/**
 * Lüscher Color Test Interpretation Service
 *
 * Maps color sorting sequence to psychological profile and tone adjustments.
 */

export const COLOR_TO_LUSCHER: Record<ColorId, number> = {
  [ColorId.GREY]: 0,
  [ColorId.BLUE]: 1,
  [ColorId.GREEN]: 2,
  [ColorId.RED]: 3,
  [ColorId.YELLOW]: 4,
  [ColorId.VIOLET]: 5,
  [ColorId.BROWN]: 6,
  [ColorId.BLACK]: 7,
};

export const LUSCHER_TO_COLOR: Record<number, ColorId> = {
  0: ColorId.GREY,
  1: ColorId.BLUE,
  2: ColorId.GREEN,
  3: ColorId.RED,
  4: ColorId.YELLOW,
  5: ColorId.VIOLET,
  6: ColorId.BROWN,
  7: ColorId.BLACK,
};

const BASIC_COLORS = [1, 2, 3, 4];
const AUXILIARY_COLORS = [0, 5, 6, 7];
const ACHROMATIC_COLORS = [0, 6, 7];

export interface LuescherProfile {
  sequence: number[];
  desired: number[];
  current: number[];
  indifferent: number[];
  rejected: number[];
  anxietyIndicators: string[];
  stressLevel: number;
  hasWorkGroup: boolean;
  compensatingFor: number[];
  compensatingWith: number[];
  toneAdjustments: { patience: number; validation: number; directness: number };
  timestamp: number;
}

const REJECTED_COLOR_ANXIETY: Record<number, any> = {
  1: { anxiety: 'rejected_blue', compensations: [2, 3, 4], toneImpact: { patience: 0.8, validation: 0.6 } },
  2: { anxiety: 'rejected_green', compensations: [1, 3, 4], toneImpact: { validation: 0.8, directness: 0.3 } },
  3: { anxiety: 'rejected_orange', compensations: [1, 2, 4], toneImpact: { patience: 0.9, directness: 0.2 } },
  4: { anxiety: 'rejected_yellow', compensations: [1, 2, 3], toneImpact: { validation: 0.9, patience: 0.7 } },
};

const ACHROMATIC_IN_FIRST_THREE: Record<number, any> = {
  0: { indicator: 'grey_in_first_3', toneImpact: { patience: 0.9, validation: 0.8, directness: 0.2 } },
  6: { indicator: 'brown_in_first_3', toneImpact: { patience: 0.7, validation: 0.7 } },
  7: { indicator: 'black_in_first_3', toneImpact: { patience: 1.0, validation: 1.0, directness: 0.1 } },
};

export function sequenceToLuscher(colorSequence: ColorId[]): number[] {
  return colorSequence.map(color => COLOR_TO_LUSCHER[color]);
}

function detectWorkGroup(sequence: number[]): boolean {
  const workColors = [2, 3, 4];
  const firstThree = sequence.slice(0, 3);
  for (let i = 0; i < firstThree.length - 1; i++) {
    if (workColors.includes(firstThree[i]) && workColors.includes(firstThree[i + 1])) return true;
  }
  return false;
}

function detectAnxiety(profile: Partial<LuescherProfile>) {
  const indicators: string[] = [];
  const compensatingFor: number[] = [];
  const compensatingWith: number[] = [];

  profile.rejected?.forEach(color => {
    if (BASIC_COLORS.includes(color)) {
      const anxiety = REJECTED_COLOR_ANXIETY[color];
      if (anxiety) {
        indicators.push(anxiety.anxiety);
        compensatingFor.push(color);
        profile.desired?.forEach(desiredColor => {
          if (anxiety.compensations.includes(desiredColor)) compensatingWith.push(desiredColor);
        });
      }
    }
  });

  const firstThree = [...(profile.desired || []), ...(profile.current || []).slice(0, 1)];
  firstThree.forEach(color => { if (ACHROMATIC_COLORS.includes(color)) { const ind = ACHROMATIC_IN_FIRST_THREE[color]; if (ind) indicators.push(ind.indicator); } });

  const firstFive = [...(profile.desired || []), ...(profile.current || []), ...(profile.indifferent || []).slice(0, 1)];
  BASIC_COLORS.forEach(basicColor => { if (!firstFive.includes(basicColor)) indicators.push(`missing_basic_${basicColor}`); });

  return { indicators, compensatingFor, compensatingWith };
}

function calculateToneAdjustments(profile: Partial<LuescherProfile>) {
  let patience = 0.5, validation = 0.5, directness = 0.5;
  profile.rejected?.forEach(color => { const anxiety = REJECTED_COLOR_ANXIETY[color]; if (anxiety?.toneImpact) { if (anxiety.toneImpact.patience !== undefined) patience = Math.max(patience, anxiety.toneImpact.patience); if (anxiety.toneImpact.validation !== undefined) validation = Math.max(validation, anxiety.toneImpact.validation); if (anxiety.toneImpact.directness !== undefined) directness = Math.min(directness, anxiety.toneImpact.directness); } });
  const firstThree = [...(profile.desired || []), ...(profile.current || []).slice(0, 1)];
  firstThree.forEach(color => { const indicator = ACHROMATIC_IN_FIRST_THREE[color]; if (indicator?.toneImpact) { if (indicator.toneImpact.patience !== undefined) patience = Math.max(patience, indicator.toneImpact.patience); if (indicator.toneImpact.validation !== undefined) validation = Math.max(validation, indicator.toneImpact.validation); if (indicator.toneImpact.directness !== undefined) directness = Math.min(directness, indicator.toneImpact.directness); } });
  return { patience: Math.min(1, Math.max(0, patience)), validation: Math.min(1, Math.max(0, validation)), directness: Math.min(1, Math.max(0, directness)) };
}

function calculateStressLevel(anxietyIndicators: string[], compensatingFor: number[]) {
  let stress = 0; stress += compensatingFor.length * 0.2; if (anxietyIndicators.includes('black_in_first_3')) stress += 0.3; if (anxietyIndicators.includes('grey_in_first_3')) stress += 0.2; if (anxietyIndicators.includes('brown_in_first_3')) stress += 0.1; const missingBasics = anxietyIndicators.filter(i => i.startsWith('missing_basic_')); stress += missingBasics.length * 0.15; return Math.min(1, stress);
}

export function interpretSequence(colorSequence: ColorId[]): LuescherProfile {
  if (colorSequence.length !== 8) throw new Error('Lüscher sequence must contain exactly 8 colors');
  const sequence = sequenceToLuscher(colorSequence);
  const desired = sequence.slice(0, 2); const current = sequence.slice(2, 4); const indifferent = sequence.slice(4, 6); const rejected = sequence.slice(6, 8);
  const partialProfile: Partial<LuescherProfile> = { sequence, desired, current, indifferent, rejected };
  const { indicators, compensatingFor, compensatingWith } = detectAnxiety(partialProfile);
  const stressLevel = calculateStressLevel(indicators, compensatingFor);
  const hasWorkGroup = detectWorkGroup(sequence);
  const toneAdjustments = calculateToneAdjustments(partialProfile);
  return { sequence, desired, current, indifferent, rejected, anxietyIndicators: indicators, stressLevel, hasWorkGroup, compensatingFor, compensatingWith, toneAdjustments, timestamp: Date.now() };
}

export async function storeLuescherProfile(profile: LuescherProfile): Promise<void> {
  try {
    if ((srgStorage as any).db === null) await srgStorage.initialize();
    await srgStorage.putLuescherProfile(profile);
    return;
  } catch (e) {
    console.warn('[Lüscher] Failed to store profile via srgStorage', e);
    console.log('[Lüscher] Profile stored (fallback):', profile);
  }
}

export async function getLatestLuescherProfile(): Promise<LuescherProfile | null> {
  try {
    if ((srgStorage as any).db === null) await srgStorage.initialize();
    return await srgStorage.getLatestLuescherProfile();
  } catch (e) {
    console.warn('[Lüscher] getLatestLuescherProfile failed', e);
    return null;
  }
}

export function shouldRefreshProfile(profile: LuescherProfile | null): boolean {
  if (!profile) return true; const THIRTY_MINUTES = 30 * 60 * 1000; const age = Date.now() - profile.timestamp; return age > THIRTY_MINUTES;
}

export function getEmpathyContext(profile: LuescherProfile) {
  const { patience, validation, directness } = profile.toneAdjustments; let systemPromptAddition = '';
  if (patience > 0.7) systemPromptAddition += 'Use slower pacing and simpler explanations. ';
  if (validation > 0.7) systemPromptAddition += 'Provide extra validation and affirmation. Avoid challenging statements. ';
  if (directness < 0.3) systemPromptAddition += 'Use gentle, indirect language. Avoid blunt or confrontational phrasing. ';
  if (profile.stressLevel > 0.6) systemPromptAddition += 'User is experiencing high stress - prioritize safety and stability. ';
  return { systemPromptAddition: systemPromptAddition.trim(), memoryFiltering: { avoidTriggering: profile.stressLevel > 0.5, preferCalming: patience > 0.7 || validation > 0.7 } };
}

export function summarizeProfile(profile: LuescherProfile): string {
  const colorNames = profile.sequence.map(n => {
    const color = LUSCHER_TO_COLOR[n];
    return COLOR_TO_LUSCHER[color] === n ? color : '?';
  });
  return `Lüscher Profile (${new Date(profile.timestamp).toLocaleString()})\nSequence: ${colorNames.join(' → ')}\nDesired: ${profile.desired.map(n => LUSCHER_TO_COLOR[n]).join(', ')}\nCurrent: ${profile.current.map(n => LUSCHER_TO_COLOR[n]).join(', ')}\nIndifferent: ${profile.indifferent.map(n => LUSCHER_TO_COLOR[n]).join(', ')}\nRejected: ${profile.rejected.map(n => LUSCHER_TO_COLOR[n]).join(', ')}\nStress Level: ${(profile.stressLevel * 100).toFixed(0)}%\nWork Group: ${profile.hasWorkGroup ? 'Yes' : 'No'}`;
}
