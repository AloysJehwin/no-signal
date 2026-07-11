import {NativeModules} from 'react-native';

// Contract: the Kotlin module MUST expose exactly this method name so the JS
// facade stays a pure passthrough. Break this and every DECIDE call fails.
interface GemmaInferenceNative {
  runInference(prompt: string): Promise<string>;
  isReady(): Promise<boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const native: GemmaInferenceNative | undefined = (NativeModules as any).GemmaInference;

export const GemmaBridge = {
  async runInference(prompt: string): Promise<string> {
    if (!native) throw new Error('GemmaInference native module not linked');
    return native.runInference(prompt);
  },
  async isReady(): Promise<boolean> {
    if (!native) return false;
    return native.isReady();
  },
};
