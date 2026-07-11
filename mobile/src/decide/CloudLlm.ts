import Constants from 'expo-constants';

// Direct-to-Gemini fallback used when the on-device model isn't available or
// the EXPO_PUBLIC_USE_ONDEVICE_LLM flag is off.

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// If we're offline this call would otherwise hang for the OS default (~30s+).
// Bail after 15s so a photo/audio diagnosis fails fast and the caller can
// surface a clean error.
const CLOUD_DECIDE_TIMEOUT_MS = 15000;

const getKey = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as {geminiApiKey?: string} | undefined;
  return extra?.geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
};

interface GeminiPart {
  text?: string;
  inlineData?: {mimeType: string; data: string};
}

const inferImageMime = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

const inferAudioMime = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mp3';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac') || lower.endsWith('.m4a')) return 'audio/aac';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.3gp')) return 'audio/3gpp';
  return 'audio/mp4';
};

const encodeUriAsBase64 = async (uri: string, mimeType: string): Promise<GeminiPart | null> => {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return {inlineData: {mimeType, data: b64}};
  } catch {
    return null;
  }
};

export interface CloudInferenceInput {
  prompt: string;
  imageUri?: string | null;
  audioUri?: string | null;
}

export const CloudLlm = {
  async runInference(input: CloudInferenceInput | string, imageUriLegacy: string | null = null): Promise<string> {
    const key = getKey();
    if (!key) throw new Error('missing EXPO_PUBLIC_GEMINI_API_KEY');

    const inp: CloudInferenceInput = typeof input === 'string'
      ? {prompt: input, imageUri: imageUriLegacy}
      : input;

    const parts: GeminiPart[] = [{text: inp.prompt}];
    if (inp.imageUri) {
      const imgPart = await encodeUriAsBase64(inp.imageUri, inferImageMime(inp.imageUri));
      if (imgPart) parts.push(imgPart);
    }
    if (inp.audioUri) {
      const audioPart = await encodeUriAsBase64(inp.audioUri, inferAudioMime(inp.audioUri));
      if (audioPart) parts.push(audioPart);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLOUD_DECIDE_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{role: 'user', parts}],
          generationConfig: {
            temperature: 0.6,
            topP: 0.9,
            maxOutputTokens: 3072,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                hypothesis: {type: 'STRING'},
                step: {type: 'STRING'},
                substeps: {type: 'ARRAY', items: {type: 'STRING'}},
                expected: {type: 'STRING'},
                confidence: {type: 'NUMBER'},
                visualObservations: {type: 'ARRAY', items: {type: 'STRING'}},
                audioObservations: {type: 'ARRAY', items: {type: 'STRING'}},
                illustrationPrompts: {type: 'ARRAY', items: {type: 'STRING'}},
                ttsScript: {type: 'STRING'},
                referenceSoundPrompt: {type: 'STRING'},
              },
              required: ['hypothesis', 'step', 'substeps', 'expected', 'confidence', 'illustrationPrompts', 'ttsScript'],
            },
          },
        }),
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new Error(aborted ? 'Cloud model timed out. Check your internet connection.' : 'Network error reaching the cloud model.');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`gemini ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {parts?: Array<{text?: string}>};
        finishReason?: string;
      }>;
    };
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    if (!text) throw new Error('Gemini returned an empty response. Please try again.');
    if (cand?.finishReason === 'SAFETY') {
      throw new Error('The model blocked this response for safety reasons. Try rewording the symptom.');
    }
    return text;
  },
  async isReady(): Promise<boolean> {
    return Boolean(getKey());
  },
};
