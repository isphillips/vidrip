import React, { useEffect, useState } from 'react';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

// Briefly spins up the front-camera session (hidden) so the recorder's first open is warm and
// doesn't freeze. Time-boxed so the camera indicator isn't on the whole time the user browses,
// and only runs if permission is already granted (never prompts). Mount on screens that lead
// into recording. Re-warms each time the screen mounts.
export default function CameraWarmup({ seconds = 6 }: { seconds?: number }) {
  const device = useCameraDevice('front');
  const { hasPermission } = useCameraPermission();
  const [active, setActive] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setActive(false), seconds * 1000);
    return () => clearTimeout(t);
  }, [seconds]);

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
