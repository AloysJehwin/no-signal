import {requireNativeModule} from 'expo-modules-core';

interface ExpoGemmaLlmNative {
  isReady(): boolean;
  initializeModel(modelPath: string): Promise<boolean>;
  runInference(prompt: string, imageUri: string | null): Promise<string>;
  unload(): Promise<boolean>;
}

// A JSON object may be embedded in a wrapped prompt (SYSTEM + DIAGNOSTIC CONTEXT + ...).
// Grab the first {...} block that parses.
const extractPayload = (prompt: string): {session?: {symptomRaw?: string; equipmentType?: string}} => {
  const start = prompt.indexOf('{');
  if (start === -1) return {};
  for (let end = prompt.lastIndexOf('}'); end > start; end--) {
    if (prompt[end] !== '}') continue;
    try {
      return JSON.parse(prompt.slice(start, end + 1));
    } catch {
      // keep scanning shorter tails
    }
  }
  return {};
};

// Falls back to a stub when the native module isn't linked (Expo Go / web).
const stub: ExpoGemmaLlmNative = {
  isReady: () => false,
  initializeModel: async () => false,
  runInference: async (prompt: string) => {
    await new Promise(r => setTimeout(r, 400));
    const {session} = extractPayload(prompt);
    const symptom = session?.symptomRaw?.trim() || 'the reported symptom';
    const equipment = session?.equipmentType || 'equipment';
    return JSON.stringify({
      hypothesis: `[stub] most-likely cause for ${symptom}`,
      step: `Inspect the ${equipment.replace('_', ' ')} for signs related to "${symptom}"`,
      substeps: [
        'Check power/fuel supply is present',
        'Inspect visible connections for damage',
        'Listen for unusual noises during operation',
      ],
      expected: 'symptom resolved or root cause visible',
      confidence: 0.35,
      visualObservations: [],
      audioObservations: [],
      illustrationPrompts: [
        'Technician hand pointing at electrical supply panel with power indicator',
        'Close-up hand with flashlight inspecting cable connections',
        'Technician cupping ear near running equipment listening for sounds',
      ],
      ttsScript: `Let's diagnose the ${equipment.replace('_', ' ')}. Start by checking the power or fuel supply, then inspect visible connections for damage.`,
      referenceSoundPrompt: '',
    });
  },
  unload: async () => true,
};

let native: ExpoGemmaLlmNative;
try {
  native = requireNativeModule<ExpoGemmaLlmNative>('ExpoGemmaLlm');
} catch {
  native = stub;
}

export const ExpoGemmaLlm = native;
export const isNativeLlmAvailable = native !== stub;
