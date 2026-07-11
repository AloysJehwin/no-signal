import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {CameraView, useCameraPermissions} from 'expo-camera';
import {OfflineBadge} from './OfflineBadge';
import {HandoffReportView} from './HandoffReportView';
import {ConfirmDialog} from './ConfirmDialog';
import {SkeletonStepCard} from './SkeletonStepCard';
import {AudioRecorderView} from './AudioRecorderView';
import {PlayButton} from './PlayButton';
import {ReasoningLoop, DecideResult} from '../decide/ReasoningLoop';
import {SessionStore} from '../state/SessionStore';
import {SessionState} from '../state/SessionState';
import {HandoffReport} from '../sync/HandoffReport';
import {
  colors,
  spacing,
  radius,
  typography,
  shadows,
  touchTargets,
  characters,
} from './theme';

const humanizeError = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.startsWith('{') || raw.includes('"hypothesis"')) {
    return 'The model returned an unreadable response. Please try again.';
  }
  if (/gemini 401|invalid api key/i.test(raw)) return 'API key was rejected. Please contact support.';
  if (/gemini 403/i.test(raw)) return 'API access denied for this key.';
  if (/gemini 429|rate limit/i.test(raw)) return 'The model is busy. Wait a moment and try again.';
  if (/gemini 5\d\d/i.test(raw)) return 'The model service is unavailable. Please try again in a minute.';
  if (/network|failed to fetch|timed? out/i.test(raw)) return 'No connection to the AI service. Check your internet.';
  if (/missing.*token|api.?key/i.test(raw)) return 'Missing configuration. Please contact support.';
  if (raw.length > 140) return 'Something went wrong. Please try again.';
  return raw;
};

type AttachPillProps = {label: string; onClear: () => void};
const AttachedPill: React.FC<AttachPillProps> = ({label, onClear}) => (
  <View style={styles.attachedPill}>
    <View style={styles.attachedPillDot} />
    <Text style={styles.attachedPillText}>{label}</Text>
    <TouchableOpacity
      onPress={onClear}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
      style={styles.attachedPillClear}>
      <View style={styles.crossBarA} />
      <View style={styles.crossBarB} />
    </TouchableOpacity>
  </View>
);

export const MainScreen: React.FC = () => {
  const [loop] = useState(() => new ReasoningLoop());
  const [symptom, setSymptom] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [audioUri, setAudioUri] = useState<string | undefined>();
  const [session, setSession] = useState<SessionState | null>(null);
  const [current, setCurrent] = useState<DecideResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<HandoffReport | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [fixedToast, setFixedToast] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => SessionStore.instance.subscribe(setSession), []);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: busy ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [busy, fade]);

  useEffect(() => {
    if (!busy) {
      bob.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [busy, bob]);

  const showFixed = useCallback(() => {
    setFixedToast(true);
    setTimeout(() => setFixedToast(false), 1600);
  }, []);

  const resetSession = useCallback(() => {
    SessionStore.instance.reset();
    setCurrent(null);
    setHandoff(null);
    setSymptom('');
    setPhotoUri(undefined);
    setAudioUri(undefined);
    setVoiceError(null);
    setDiagnoseError(null);
  }, []);

  const confirmBack = useCallback(() => {
    setConfirmBackOpen(true);
  }, []);

  const handleDiscardConfirmed = useCallback(() => {
    setConfirmBackOpen(false);
    resetSession();
  }, [resetSession]);

  const beginSession = useCallback(async () => {
    if (!symptom.trim()) return;
    setBusy(true);
    setHandoff(null);
    setDiagnoseError(null);
    try {
      loop.sense({
        equipmentType: 'unknown',
        symptomRaw: symptom,
        photoUri,
        audioUri,
        capturedAt: new Date().toISOString(),
      });
      const step = await loop.decide();
      loop.act(step);
      setCurrent(step);
    } catch (e) {
      setDiagnoseError(humanizeError(e));
      SessionStore.instance.reset();
      setCurrent(null);
    } finally {
      setBusy(false);
    }
  }, [loop, symptom, photoUri, audioUri]);

  const report = useCallback(
    async (worked: boolean) => {
      if (!current || !session) return;
      setBusy(true);
      setDiagnoseError(null);
      try {
        const step = loop.check(current, worked ? current.expected : 'did not work');
        const after = SessionStore.instance.current;
        if (after?.status === 'resolved') {
          setCurrent(null);
          showFixed();
          return;
        }
        if (after?.status === 'deferred') {
          setHandoff(loop.defer(false));
          setCurrent(null);
          return;
        }
        void step;
        setCurrent(null);
        const next = await loop.decide();
        loop.act(next);
        setCurrent(next);
      } catch (e) {
        setDiagnoseError(humanizeError(e));
      } finally {
        setBusy(false);
      }
    },
    [loop, current, session, showFixed],
  );

  const openAudio = useCallback(() => {
    setVoiceError(null);
    setAudioOpen(true);
  }, []);

  const onAudioCapture = useCallback((uri: string) => {
    setAudioUri(uri);
    setAudioOpen(false);
  }, []);

  const openCamera = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOpen(true);
  }, [permission, requestPermission]);

  const capture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({quality: 0.7});
      if (photo?.uri) setPhotoUri(photo.uri);
    } catch (e) {
      setDiagnoseError(e instanceof Error ? e.message : 'capture failed');
    }
    setCameraOpen(false);
  }, []);

  if (cameraOpen) {
    return (
      <View style={styles.cameraRoot}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <TouchableOpacity
          style={styles.cameraClose}
          onPress={() => setCameraOpen(false)}>
          <View style={[styles.crossBarA, styles.crossBarLight]} />
          <View style={[styles.crossBarB, styles.crossBarLight]} />
        </TouchableOpacity>
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.captureBtn} onPress={capture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (audioOpen) {
    return (
      <AudioRecorderView
        onCapture={onAudioCapture}
        onCancel={() => setAudioOpen(false)}
      />
    );
  }

  const inSession = session?.status === 'in_progress';
  const sessionTag = session?.sessionId ? session.sessionId.slice(0, 4) : null;
  const confPct = current ? Math.round((current.confidence ?? 0) * 100) : 0;
  const showInput = !inSession && !handoff;
  const showEmptyCharacter = showInput && !busy && !diagnoseError;

  const bobTranslate = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  return (
    <View style={styles.root}>
      {fixedToast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>FIXED</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
        {/* Greeting header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Hi, Technician.</Text>
            <Text style={styles.subgreeting}>Let's diagnose the issue.</Text>
          </View>
          <View style={styles.headerRight}>
            <OfflineBadge />
          </View>
        </View>

        {inSession && sessionTag ? (
          <View style={styles.sessionPill}>
            <View style={styles.dot} />
            <Text style={styles.sessionPillText}>SESSION #{sessionTag}</Text>
          </View>
        ) : null}

        {diagnoseError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>DIAGNOSE FAILED</Text>
            <Text style={styles.errorBody}>{diagnoseError}</Text>
            <TouchableOpacity
              style={styles.errorDismiss}
              onPress={() => setDiagnoseError(null)}>
              <Text style={styles.errorDismissText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showEmptyCharacter ? (
          <View style={styles.characterWrap}>
            <Image
              source={characters.thinking}
              style={styles.characterImg}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {showInput ? (
          <View style={styles.inputSection}>
            <Text style={styles.sectionTitle}>Describe the issue.</Text>
            <Text style={styles.sectionSubtitle}>
              Tell us what's wrong. Add a photo or a sound if it helps.
            </Text>

            <View style={styles.inputCard}>
              <TextInput
                style={styles.input}
                placeholder="e.g. Engine won't start, black smoke..."
                placeholderTextColor={colors.textTertiary}
                value={symptom}
                onChangeText={setSymptom}
                multiline
              />

              {(photoUri || audioUri) ? (
                <View style={styles.attachedRow}>
                  {photoUri ? (
                    <AttachedPill
                      label="PHOTO ATTACHED"
                      onClear={() => setPhotoUri(undefined)}
                    />
                  ) : null}
                  {audioUri ? (
                    <AttachedPill
                      label="AUDIO ATTACHED"
                      onClear={() => setAudioUri(undefined)}
                    />
                  ) : null}
                </View>
              ) : null}

              <View style={styles.attachRow}>
                <TouchableOpacity style={styles.iconChip} onPress={openCamera}>
                  <View style={styles.chipGlyphPhoto} />
                  <Text style={styles.iconChipText}>
                    {photoUri ? 'RETAKE' : 'PHOTO'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconChip} onPress={openAudio}>
                  <View style={styles.chipGlyphVoice} />
                  <Text style={styles.iconChipText}>
                    {audioUri ? 'RE-RECORD' : 'AUDIO'}
                  </Text>
                </TouchableOpacity>
              </View>

              {voiceError ? (
                <Text style={styles.voiceError}>{voiceError}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.ctaBtn, !symptom.trim() && styles.ctaDisabled]}
              onPress={beginSession}
              disabled={!symptom.trim() || busy}
              activeOpacity={0.85}>
              <Text style={styles.ctaText}>Diagnose</Text>
              <Text style={styles.ctaArrow}>→</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {busy && !current ? (
          <Animated.View style={{opacity: fade}}>
            <View style={styles.diagnosingCharWrap}>
              <Animated.Image
                source={characters.diagnosing}
                style={[
                  styles.diagnosingCharImg,
                  {transform: [{translateY: bobTranslate}]},
                ]}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.busyCaption}>
              {audioUri
                ? 'LISTENING TO YOUR AUDIO…'
                : photoUri
                ? 'ANALYZING PHOTO…'
                : 'THINKING…'}
            </Text>
            <SkeletonStepCard showVisual={Boolean(photoUri || audioUri)} />
          </Animated.View>
        ) : null}

        {current && inSession ? (
          <View style={styles.stepCard}>
            <View style={styles.stepCardHeader}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={confirmBack}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                <Text style={styles.backArrow}>‹</Text>
              </TouchableOpacity>
              <View style={styles.confBadge}>
                <Text style={styles.confBadgeText}>
                  {confPct}% CONFIDENT
                </Text>
              </View>
            </View>

            {current.hypothesis ? (
              <View style={styles.hypothesisBlock}>
                <Text style={styles.microLabel}>MOST LIKELY CAUSE</Text>
                <Text style={styles.hypothesisText}>{current.hypothesis}</Text>
              </View>
            ) : null}

            <View style={styles.stepBlock}>
              <Text style={styles.microLabel}>DO THIS</Text>
              <Text style={styles.stepText}>{current.step}</Text>
            </View>

            {current.substeps && current.substeps.length > 0 ? (
              <View style={styles.substepList}>
                {current.substeps.map((s, i) => (
                  <View key={i} style={styles.substepItem}>
                    <View style={styles.substepRow}>
                      <View style={styles.substepNum}>
                        <Text style={styles.substepNumText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.substepText}>{s}</Text>
                    </View>
                    {current.substepImages?.[i] ? (
                      <Image
                        source={{uri: current.substepImages[i] as string}}
                        style={styles.substepImage}
                        resizeMode="contain"
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {(current.ttsUri || current.referenceSoundUri) ? (
              <View style={styles.audioControls}>
                {current.ttsUri ? (
                  <PlayButton uri={current.ttsUri} label="Listen" />
                ) : null}
                {current.referenceSoundUri ? (
                  <PlayButton uri={current.referenceSoundUri} label="Reference sound" />
                ) : null}
              </View>
            ) : null}

            <View style={styles.expectedBlock}>
              <Text style={styles.microLabel}>EXPECTED RESULT</Text>
              <Text style={styles.expectedText}>{current.expected}</Text>
            </View>

            {current.visualObservations && current.visualObservations.length > 0 ? (
              <View style={styles.visualBlock}>
                <Text style={styles.microLabel}>FROM YOUR PHOTO</Text>
                {current.visualObservations.map((obs, i) => (
                  <View key={i} style={styles.visualRow}>
                    <View style={styles.visualDot} />
                    <Text style={styles.visualText}>{obs}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {current.audioObservations && current.audioObservations.length > 0 ? (
              <View style={styles.visualBlock}>
                <Text style={styles.microLabel}>FROM YOUR AUDIO</Text>
                {current.audioObservations.map((obs, i) => (
                  <View key={i} style={styles.visualRow}>
                    <View style={styles.visualDot} />
                    <Text style={styles.visualText}>{obs}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.outcomeRow}>
              <TouchableOpacity
                style={[styles.outcomeBtn, styles.outcomeWorked]}
                onPress={() => report(true)}
                disabled={busy}
                activeOpacity={0.85}>
                <Text style={styles.outcomeText}>Worked</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.outcomeBtn, styles.outcomeFailed]}
                onPress={() => report(false)}
                disabled={busy}
                activeOpacity={0.85}>
                <Text style={styles.outcomeTextFailed}>Didn't work</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {handoff ? (
          <View style={styles.handoffWrap}>
            <HandoffReportView report={handoff} />
          </View>
        ) : null}

        {(handoff || session?.status === 'resolved') && !inSession ? (
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={resetSession}
            activeOpacity={0.85}>
            <Text style={styles.ctaText}>Start new session</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </TouchableOpacity>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmBackOpen}
        title="Discard this session?"
        body="You'll lose your progress and return to the start."
        confirmLabel="Discard"
        cancelLabel="Keep working"
        destructive
        onConfirm={handleDiscardConfirmed}
        onCancel={() => setConfirmBackOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surface},
  kav: {flex: 1},
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },

  // Header (greeting) — big bold display headline
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {flex: 1, paddingRight: spacing.md},
  headerRight: {alignItems: 'flex-end'},
  greeting: {...typography.display, color: colors.textPrimary},
  subgreeting: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  // Session pill
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink},
  sessionPillText: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },

  // Success toast — black pill
  toast: {
    alignSelf: 'center',
    backgroundColor: colors.cta,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    ...shadows.md,
  },
  toastText: {
    ...typography.micro,
    color: colors.ctaText,
    fontSize: 12,
    letterSpacing: 1,
  },

  // Empty state character
  characterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  characterImg: {
    width: 220,
    height: 200,
  },

  // Diagnosing character (bobs)
  diagnosingCharWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  diagnosingCharImg: {
    width: 140,
    height: 120,
  },

  // Input section (main flow)
  inputSection: {gap: spacing.md},
  sectionTitle: {...typography.title, color: colors.textPrimary},
  sectionSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  inputCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  input: {
    minHeight: 120,
    textAlignVertical: 'top',
    ...typography.body,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
    padding: 0,
  },
  attachedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  attachedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  attachedPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ink,
  },
  attachedPillText: {
    ...typography.micro,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  attachedPillClear: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossBarA: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: colors.ink,
    transform: [{rotate: '45deg'}],
  },
  crossBarB: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: colors.ink,
    transform: [{rotate: '-45deg'}],
  },
  crossBarLight: {
    backgroundColor: colors.textInverse,
    width: 20,
    height: 2,
  },

  // Attach chips — outlined ink pills, no emoji glyphs
  attachRow: {flexDirection: 'row', gap: spacing.sm},
  iconChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  chipGlyphPhoto: {
    width: 14,
    height: 11,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  chipGlyphVoice: {
    width: 6,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.ink,
  },
  iconChipText: {
    ...typography.micro,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  voiceError: {...typography.caption, color: colors.danger},

  // Primary black round pill CTA — hero touch target
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.cta,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    minHeight: touchTargets.hero,
    marginTop: spacing.md,
  },
  ctaDisabled: {backgroundColor: colors.ctaDisabled},
  ctaText: {...typography.heading, color: colors.ctaText, fontWeight: '700'},
  ctaArrow: {color: colors.ctaText, fontSize: 22, fontWeight: '700'},

  busyCaption: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },

  // Step card — flat white with hairline border, no shadow
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 24,
    lineHeight: 26,
    color: colors.textPrimary,
    fontWeight: '400',
    marginTop: -2,
  },
  confBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.cta,
  },
  confBadgeText: {
    ...typography.micro,
    color: colors.ctaText,
    textTransform: 'uppercase',
  },

  microLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },

  hypothesisBlock: {gap: spacing.sm, marginTop: spacing.sm},
  hypothesisText: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 20,
    lineHeight: 26,
  },

  stepBlock: {gap: spacing.sm, marginTop: spacing.sm},
  stepText: {...typography.heading, color: colors.textPrimary},

  substepList: {gap: spacing.md, marginTop: spacing.sm},
  substepItem: {gap: spacing.sm},
  substepRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md},
  substepImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginTop: spacing.xs,
    marginLeft: 44,
    maxWidth: '85%',
  },
  audioControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  substepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  substepNumText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  substepText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    paddingTop: 3,
  },

  expectedBlock: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.sm,
  },
  expectedText: {...typography.body, color: colors.textPrimary},

  visualBlock: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  visualRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  visualDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.ink,
    marginTop: 9,
  },
  visualText: {...typography.body, color: colors.textPrimary, flex: 1},

  outcomeRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md},
  outcomeBtn: {
    flex: 1,
    minHeight: touchTargets.primary,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeWorked: {backgroundColor: colors.cta},
  outcomeFailed: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  outcomeText: {...typography.heading, color: colors.ctaText, fontWeight: '700'},
  outcomeTextFailed: {...typography.heading, color: colors.textPrimary, fontWeight: '700'},

  handoffWrap: {marginTop: spacing.md},

  // Error banner — muted crimson using theme.danger
  errorBanner: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorTitle: {
    ...typography.micro,
    color: colors.danger,
    textTransform: 'uppercase',
  },
  errorBody: {...typography.body, color: colors.textPrimary},
  errorDismiss: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  errorDismissText: {
    ...typography.micro,
    color: colors.danger,
    textTransform: 'uppercase',
  },

  // Camera
  cameraRoot: {flex: 1, backgroundColor: colors.ink},
  camera: {flex: 1},
  cameraClose: {
    position: 'absolute',
    top: spacing.xxl,
    left: spacing.lg,
    width: touchTargets.min,
    height: touchTargets.min,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraControls: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: touchTargets.hero,
    height: touchTargets.hero,
    borderRadius: touchTargets.hero / 2,
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
});
