import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radius, spacing, touchTargets, typography} from './theme';

// Lazy-load expo-audio the same way as AudioRecorderView so this works
// on APKs built without the native module.
let audioModule: typeof import('expo-audio') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  audioModule = require('expo-audio') as typeof import('expo-audio');
  void audioModule.RecordingPresets;
} catch {
  audioModule = null;
}

interface Props {
  uri: string | null;
  label: string;
  compact?: boolean;
}

export const PlayButton: React.FC<Props> = ({uri, label, compact}) => {
  if (!uri || !audioModule) return null;
  return <PlayButtonInner uri={uri} label={label} compact={compact} />;
};

const PlayButtonInner: React.FC<{uri: string; label: string; compact?: boolean}> = ({
  uri,
  label,
  compact,
}) => {
  const {useAudioPlayer, useAudioPlayerStatus} = audioModule!;
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [isPlaying, setIsPlaying] = useState(false);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    // Auto-toggle isPlaying based on player state so the icon reflects reality.
    setIsPlaying(status?.playing ?? false);
    if (wasPlayingRef.current && status && !status.playing && status.didJustFinish) {
      // finished naturally
    }
    wasPlayingRef.current = Boolean(status?.playing);
  }, [status]);

  const toggle = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  }, [player]);

  return (
    <TouchableOpacity
      style={[styles.btn, compact && styles.btnCompact]}
      onPress={toggle}
      activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        {isPlaying ? (
          <View style={styles.pauseIcon}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        ) : (
          <View style={styles.playTriangle} />
        )}
      </View>
      <Text style={styles.label}>{isPlaying ? 'Pause' : label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    minHeight: touchTargets.min,
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
  btnCompact: {paddingVertical: spacing.xs, paddingHorizontal: spacing.sm},
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderLeftColor: colors.ctaText,
    borderTopWidth: 6,
    borderTopColor: 'transparent',
    borderBottomWidth: 6,
    borderBottomColor: 'transparent',
    marginLeft: 3,
  },
  pauseIcon: {flexDirection: 'row', gap: 3},
  pauseBar: {
    width: 3,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.ctaText,
  },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
