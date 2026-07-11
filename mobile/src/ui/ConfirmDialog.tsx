import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radius, shadows, spacing, touchTargets, typography} from './theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btnGhost}
            onPress={onCancel}
            activeOpacity={0.7}>
            <Text style={styles.btnGhostText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, destructive && styles.btnDestructive]}
            onPress={onConfirm}
            activeOpacity={0.85}>
            <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    gap: spacing.md,
    ...shadows.lg,
  },
  title: {...typography.title, color: colors.textPrimary},
  body: {...typography.body, color: colors.textSecondary},
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnGhost: {
    flex: 1,
    minHeight: touchTargets.primary,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.ink,
  },
  btnGhostText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  btnPrimary: {
    flex: 1,
    minHeight: touchTargets.primary,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cta,
  },
  btnDestructive: {backgroundColor: colors.danger},
  btnPrimaryText: {
    ...typography.bodyStrong,
    color: colors.ctaText,
  },
});
