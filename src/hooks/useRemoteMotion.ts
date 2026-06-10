import { useEffect, useState } from 'react';
import {
  getRemoteMotionDisplay,
  subscribeRemoteMotion,
  type RemoteMotionDisplay,
} from '../sync/remoteMotion';

export function useRemoteMotionDisplay(): RemoteMotionDisplay {
  const [, setTick] = useState(0);
  useEffect(() => subscribeRemoteMotion(() => setTick((n) => n + 1)), []);
  return getRemoteMotionDisplay();
}
