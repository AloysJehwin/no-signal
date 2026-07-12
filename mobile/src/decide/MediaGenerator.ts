import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

// Generates media (images, TTS, reference sounds) via Gemini generative models.
// All output is base64 which is written to app cache as file:// URIs suitable
// for <Image> and audio players.

const IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

const IMAGE_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;
const TTS_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;

// Timeouts per media type. Nano Banana image gen takes ~8-12s under
// concurrent load; TTS is faster. Extra headroom for flaky mobile networks.
const IMAGE_TIMEOUT_MS = 35000;
const TTS_TIMEOUT_MS = 20000;
const cacheDir = `${FileSystem.cacheDirectory}media/`;

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const getKey = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as {geminiApiKey?: string} | undefined;
  return extra?.geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
};

const ensureDir = async (): Promise<void> => {
  const info = await FileSystem.getInfoAsync(cacheDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(cacheDir, {intermediates: true});
  }
};

const writeBase64 = async (base64: string, ext: string): Promise<string> => {
  await ensureDir();
  const filename = `${Date.now()}-${Math.floor(Math.random() * 1e9)}.${ext}`;
  const path = `${cacheDir}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
};

// Nano Banana returns raw base64 PNG in the first inlineData part.
const generateImage = async (prompt: string): Promise<string | null> => {
  const key = getKey();
  if (!key) return null;

  const stylePrefix =
    'Clean minimal line-art technical diagram, black ink lines on white background, ' +
    'engineering-drawing style, no text labels, no colors, no shading, no people. Scene: ';

  try {
    const res = await fetchWithTimeout(`${IMAGE_ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: stylePrefix + prompt}]}],
        generationConfig: {responseModalities: ['IMAGE']},
      }),
    }, IMAGE_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {parts?: Array<{inlineData?: {data: string; mimeType: string}}>};
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!img?.inlineData?.data) return null;
    const ext = img.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
    const path = await writeBase64(img.inlineData.data, ext);
    return `file://${path}`;
  } catch {
    return null;
  }
};

// Convert raw PCM L16 (little-endian, 24000 Hz, mono) into a WAV file so
// standard audio players can decode it. Gemini TTS returns PCM without a header.
const pcmL16ToWav = (pcmBase64: string, sampleRate: number): string => {
  const binaryStr = base64ToBinaryString(pcmBase64);
  const dataLen = binaryStr.length;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM subchunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  const bytes = new Uint8Array(buf, 44);
  for (let i = 0; i < dataLen; i++) bytes[i] = binaryStr.charCodeAt(i);
  return arrayBufferToBase64(buf);
};

const base64ToBinaryString = (b64: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  const outLen = (len * 3) / 4 - padding;
  const out = new Array<string>(outLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    const t = (a << 18) | (b << 12) | (c << 6) | d;
    if (p < outLen) out[p++] = String.fromCharCode((t >> 16) & 0xff);
    if (p < outLen) out[p++] = String.fromCharCode((t >> 8) & 0xff);
    if (p < outLen) out[p++] = String.fromCharCode(t & 0xff);
  }
  return out.join('');
};

const arrayBufferToBase64 = (ab: ArrayBuffer): string => {
  const bytes = new Uint8Array(ab);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    out += chars[b1 >> 2];
    out += chars[((b1 & 3) << 4) | (b2 >> 4)];
    out += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    out += i + 2 < len ? chars[b3 & 63] : '=';
  }
  return out;
};

const parseSampleRate = (mimeType: string | undefined): number => {
  if (!mimeType) return 24000;
  const m = /rate=(\d+)/.exec(mimeType);
  return m ? Number(m[1]) : 24000;
};

const generateTts = async (script: string, voice = 'Kore'): Promise<string | null> => {
  const key = getKey();
  if (!key || !script.trim()) return null;
  try {
    const res = await fetchWithTimeout(`${TTS_ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: script}]}],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: voice}},
          },
        },
      }),
    }, TTS_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {parts?: Array<{inlineData?: {data: string; mimeType: string}}>};
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const audio = parts.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
    if (!audio?.inlineData?.data) return null;
    const sampleRate = parseSampleRate(audio.inlineData.mimeType);
    const wavB64 = pcmL16ToWav(audio.inlineData.data, sampleRate);
    const path = await writeBase64(wavB64, 'wav');
    return `file://${path}`;
  } catch {
    return null;
  }
};

// Reference sound gen: we reuse the TTS endpoint with a descriptive prompt.
// Gemini TTS-preview does synthesize non-speech when asked, but quality is
// limited — this is a nice-to-have.
const generateReferenceSound = async (prompt: string): Promise<string | null> => {
  if (!prompt.trim()) return null;
  return generateTts(`Reference sound: ${prompt}. Continue for two seconds.`, 'Puck');
};

export interface GeneratedMedia {
  substepImages: (string | null)[];
  ttsUri: string | null;
  referenceSoundUri: string | null;
}

export interface MediaRequest {
  illustrationPrompts: string[];
  ttsScript: string;
  referenceSoundPrompt: string;
}

export const MediaGenerator = {
  async generateAll(req: MediaRequest): Promise<GeneratedMedia> {
    const imagePromises = req.illustrationPrompts.map(p => generateImage(p));
    const ttsPromise = generateTts(req.ttsScript);
    const soundPromise = req.referenceSoundPrompt
      ? generateReferenceSound(req.referenceSoundPrompt)
      : Promise.resolve(null);

    const [images, ttsUri, referenceSoundUri] = await Promise.all([
      Promise.all(imagePromises),
      ttsPromise,
      soundPromise,
    ]);
    return {substepImages: images, ttsUri, referenceSoundUri};
  },
};
