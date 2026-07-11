import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radius, shadows, spacing, touchTargets, typography} from './theme';

// Attempt to load expo-audio. If the native side isn't present (older APK),
// the require throws and we render a friendly fallback instead of crashing.
let audioModule: typeof import('expo-audio') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  audioModule = require('expo-audio') as typeof import('expo-audio');
  // Access RecordingPresets to force the native binding — if it fails, catch will fire.
  void audioModule.RecordingPresets;
} catch {
  audioModule = null;
}

interface Props {
  onCapture: (uri: string) => void;
  onCancel: () => void;
}

const MAX_SECONDS = 30;
const BAR_COUNT = 32;

const fmt = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const s = String(total % 60).padStart(2, '0');
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  return `${m}:${s}`;
};

export const AudioRecorderView: React.FC<Props> = props => {
  if (!audioModule) {
    return (
      <View style={styles.root}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Audio not available</Text>
          <Text style={styles.errorBody}>
            Audio recording needs the latest app build. It will work after the next dev-client install.
          </Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={props.onCancel} activeOpacity={0.85}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <AudioRecorderInner {...props} />;
};

const AudioRecorderInner: React.FC<Props> = ({onCapture, onCancel}) => {
  const {
    RecordingPresets,
    useAudioRecorder,
    useAudioRecorderState,
    AudioModule,
    setAudioModeAsync,
  } = audioModule!;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 100);
  const [permError, setPermError] = useState<string | null>(null);
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0.1));
  const startedRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const p = await AudioModule.requestRecordingPermissionsAsync();
        if (!p.granted) {
          setPermError('Microphone permission is required to record.');
          return;
        }
        await setAudioModeAsync({allowsRecording: true, playsInSilentMode: true});
        await recorder.prepareToRecordAsync();
        recorder.record();
        startedRef.current = true;
      } catch (e) {
        setPermError(e instanceof Error ? e.message : 'Failed to start recording');
      }
    })();
    return () => {
      if (startedRef.current) {
        recorder.stop().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const metering = state?.metering;
    if (typeof metering !== 'number') return;
    // metering is in dB (typically -160..0). Convert to 0..1.
    const norm = Math.max(0, Math.min(1, (metering + 60) / 60));
    setBars(prev => {
      const next = prev.slice(1);
      next.push(norm);
      return next;
    });
  }, [state?.metering]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1.08, duration: 700, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: 700, useNativeDriver: true}),
      ]),
    );
    if (state?.isRecording) loop.start();
    return () => loop.stop();
  }, [state?.isRecording, pulse]);

  const elapsedMs = state?.durationMillis ?? 0;
  const stopAndSend = useCallback(async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) onCapture(uri);
      else onCancel();
    } catch {
      onCancel();
    }
  }, [recorder, onCapture, onCancel]);

  useEffect(() => {
    if (elapsedMs >= MAX_SECONDS * 1000 && state?.isRecording) {
      void stopAndSend();
    }
  }, [elapsedMs, state?.isRecording, stopAndSend]);

  if (permError) {
    return (
      <View style={styles.root}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Can't record</Text>
          <Text style={styles.errorBody}>{permError}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel} activeOpacity={0.85}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headline}>Recording</Text>
        <Text style={styles.subhead}>
          Speak your symptom, or hold the phone near the sound.
        </Text>
      </View>

      <View style={styles.waveWrap}>
        <View style={styles.waveRow}>
          {bars.map((h, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: 8 + h * 68,
                  opacity: 0.3 + h * 0.7,
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.timer}>{fmt(elapsedMs)}</Text>
        <Text style={styles.limit}>MAX {MAX_SECONDS}S</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={stopAndSend} activeOpacity={0.85}>
          <Animated.View style={[styles.stopBtn, {transform: [{scale: pulse}]}]}>
            <View style={styles.stopSquare} />
          </Animated.View>
        </TouchableOpacity>
        <View style={styles.spacer} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  header: {gap: spacing.sm, marginTop: spacing.xxl},
  headline: {...typography.display, color: colors.textPrimary},
  subhead: {...typography.body, color: colors.textSecondary},
  waveWrap: {alignItems: 'center', gap: spacing.md},
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 96,
    width: '100%',
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  timer: {
    ...typography.display,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.md,
    textAlign: 'center',
  },
  limit: {
    ...typography.micro,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  cancelBtn: {
    minHeight: touchTargets.min,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.ink,
  },
  cancelText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  stopBtn: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: radius.sm / 2,
    backgroundColor: colors.surface,
  },
  spacer: {width: 84},
  errorBox: {
    marginTop: spacing.xxxl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  errorTitle: {
    ...typography.micro,
    color: colors.danger,
    textTransform: 'uppercase',
  },
  errorBody: {...typography.body, color: colors.textSecondary},
  closeBtn: {
    alignSelf: 'stretch',
    minHeight: touchTargets.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cta,
    marginBottom: spacing.xl,
  },
  closeText: {
    ...typography.bodyStrong,
    color: colors.ctaText,
  },
});
