import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUploadStore } from '../store/uploadStore';
import { C, FONT, SPACE, RADIUS } from '../theme';

// Tab bar is ~56dp; add SPACE.SM breathing room above it.
const TAB_BAR_H = 56;

export default function UploadToast() {
  const jobs = useUploadStore(s => s.jobs);
  const dismiss = useUploadStore(s => s.dismiss);
  const { bottom } = useSafeAreaInsets();

  if (jobs.length === 0) { return null; }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: bottom + TAB_BAR_H + SPACE.SM }]}>
      {jobs.map(job => (
        <TouchableOpacity
          key={job.id}
          style={[
            styles.pill,
            job.status === 'done' && styles.pillDone,
            job.status === 'error' && styles.pillError,
          ]}
          activeOpacity={job.status === 'error' ? 0.75 : 1}
          onPress={job.status === 'error' ? () => dismiss(job.id) : undefined}>

          {job.status === 'uploading' && (
            <>
              <ActivityIndicator size="small" color={C.MUTED} />
              <Text style={styles.label}>{job.label}</Text>
            </>
          )}

          {job.status === 'done' && (
            <>
              <Text style={styles.doneIcon}>✓</Text>
              <Text style={[styles.label, styles.labelDone]}>
                {job.label.replace(/…$/, '')} done
              </Text>
            </>
          )}

          {job.status === 'error' && (
            <>
              <Text style={styles.errorIcon}>✕</Text>
              <Text style={[styles.label, styles.labelError]} numberOfLines={1}>
                {job.errorMsg ?? 'Upload failed'} · tap to dismiss
              </Text>
            </>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACE.LG,
    right: SPACE.LG,
    alignItems: 'center',
    gap: SPACE.XS,
    // No pointer events on the container itself so taps pass through to the
    // navigation beneath it. Individual pills override this where needed.
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.SM,
    backgroundColor: 'rgba(12,10,9,0.93)',
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.SM + 2,
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: '100%',
    marginBottom: SPACE.SM,
  },
  pillDone: { borderColor: 'rgba(34,197,94,0.35)' },
  pillError: { borderColor: 'rgba(239,68,68,0.35)' },
  label: {
    color: C.INK,
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_MEDIUM,
    flexShrink: 1,
  },
  labelDone: { color: C.SUCCESS },
  labelError: { color: C.DANGER },
  doneIcon: {
    color: C.SUCCESS,
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_BOLD,
  },
  errorIcon: {
    color: C.DANGER,
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_BOLD,
  },
});
