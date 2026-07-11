import Voice, {SpeechResultsEvent, SpeechErrorEvent} from 'react-native-voice';

export const startListening = (locale = 'en-US'): Promise<string> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (val: string | Error) => {
      if (settled) return;
      settled = true;
      Voice.destroy().then(Voice.removeAllListeners);
      val instanceof Error ? reject(val) : resolve(val);
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const first = e.value?.[0];
      if (first) finish(first);
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) =>
      finish(new Error(e.error?.message ?? 'voice error'));

    Voice.start(locale).catch((err: unknown) =>
      finish(err instanceof Error ? err : new Error(String(err))),
    );
  });

export const cancelListening = async (): Promise<void> => {
  await Voice.stop();
  await Voice.destroy();
  Voice.removeAllListeners();
};
