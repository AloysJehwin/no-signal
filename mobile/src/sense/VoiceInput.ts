// Voice input isn't wired yet. Prototype gap — needs either:
//   • Gemma-3n audio modality (add audio path to expo-gemma-llm native module), or
//   • @react-native-voice/voice (requires another EAS rebuild).
// Until then the UI falls back to typing; this function surfaces a clear message.
export const startListening = (_locale = 'en-US'): Promise<string> =>
  Promise.reject(new Error('Voice input not available yet — please type your fault.'));

export const cancelListening = async (): Promise<void> => {
  // no-op
};
