import React, { useEffect, useRef } from 'react';
import ShareBaker, { type ShareBakerHandle } from './ShareBaker';
import { useBakeQueueStore } from '../../../store/bakeQueueStore';

// Headless baker mounted once at the app root. It fulfils background bake requests from the bakeQueue
// store (silhouette + deep-voice anonymization), one at a time, so the work survives the recorder
// unmounting and runs while a toast shows progress. Renders null when idle.
export default function BakeQueueHost() {
  const queue = useBakeQueueStore((s) => s.queue);
  const complete = useBakeQueueStore((s) => s.complete);
  const bakerRef = useRef<ShareBakerHandle>(null);
  const busyRef = useRef(false);
  const current = queue[0];

  useEffect(() => {
    if (!current || busyRef.current) { return; }
    busyRef.current = true;
    (async () => {
      try {
        const uri = await bakerRef.current!.bake({
          sourceUri: current.sourceUri,
          recipe: current.recipe,
          durationSec: current.durationSec,
          voiceMod: current.voiceMod,
          fps: current.fps,
        });
        current.resolve(uri);
      } catch (e) {
        current.reject(e);
      } finally {
        busyRef.current = false;
        complete(current.id);
      }
    })();
  }, [current, complete]);

  return <ShareBaker ref={bakerRef} />;
}
