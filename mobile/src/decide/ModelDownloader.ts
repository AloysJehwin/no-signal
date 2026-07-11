import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// Gemma-3n E2B int4, LiteRT-LM format for Android. ~3.66 GB.
// MediaPipe LlmInference accepts .litertlm and .task files.
const MODEL_URL =
  'https://huggingface.co/google/gemma-3n-E2B-it-litert-lm/resolve/main/gemma-3n-E2B-it-int4.litertlm';
const MODEL_FILENAME = 'gemma-3n-e2b-int4.litertlm';

const modelDir = `${FileSystem.documentDirectory}models/`;
const modelPath = `${modelDir}${MODEL_FILENAME}`;

const getToken = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as {hfToken?: string} | undefined;
  return extra?.hfToken || process.env.EXPO_PUBLIC_HF_TOKEN;
};

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  fraction: number;
}

export const ModelDownloader = {
  path: modelPath,

  async exists(): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(modelPath);
    return info.exists && (info.size ?? 0) > 100 * 1024 * 1024;
  },

  async ensureDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(modelDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(modelDir, {intermediates: true});
    }
  },

  async download(onProgress?: (p: DownloadProgress) => void): Promise<string> {
    await this.ensureDir();
    const token = getToken();
    if (!token) throw new Error('missing EXPO_PUBLIC_HF_TOKEN — set it in mobile/.env');

    const headers = {Authorization: `Bearer ${token}`};
    const resumable = FileSystem.createDownloadResumable(
      MODEL_URL,
      modelPath,
      {headers},
      progress => {
        if (!onProgress) return;
        const total = progress.totalBytesExpectedToWrite || 1;
        onProgress({
          totalBytesWritten: progress.totalBytesWritten,
          totalBytesExpectedToWrite: total,
          fraction: progress.totalBytesWritten / total,
        });
      },
    );

    const result = await resumable.downloadAsync();
    if (!result?.uri) throw new Error('download returned no uri');
    return result.uri;
  },

  async remove(): Promise<void> {
    const info = await FileSystem.getInfoAsync(modelPath);
    if (info.exists) await FileSystem.deleteAsync(modelPath, {idempotent: true});
  },
};
