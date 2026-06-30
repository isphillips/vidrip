import React, { useCallback, useState } from 'react';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useFocusEffect } from '@react-navigation/native';

// Briefly spins up the front-camera session (hidden) so the recorder's first open is warm and
// doesn't freeze. Time-boxed so the OS camera indicator isn't on the whole time the user browses,
// and only runs if permission is already granted (never prompts). Mount on screens that lead into
// recording. Re-warms on every FOCUS (not just mount) — tab screens stay mounted, so a plain mount
// effect wouldn't re-fire when you return to the tab and the camera would be cold again; turns the
// hidden session OFF on blur so the indicator never lingers.
export default function CameraWarmup({ seconds = 6 }: { seconds?: number }) {
  const device = useCameraDevice('front');
  const { hasPermission } = useCameraPermission();
  const [active, setActive] = useState(false);

  useFocusEffect(useCallback(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), seconds * 1000);
    return () => { clearTimeout(t); setActive(false); };
  }, [seconds]));

  if (!device || !hasPermission || !active) { return null; }
  return (
    <Camera
      device={device}
      isActive={true}
      video={true}
      audio={false}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      pointerEvents="none"
    />
  );
}
