import { useEffect, useState } from 'react';
import type { DeviceClass } from './schema/layoutSchema';

const MOBILE_MAX = 640;
const TABLET_MAX = 1024;

export function detectDeviceClass(width: number): DeviceClass {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useDeviceClass(): DeviceClass {
  const [device, setDevice] = useState<DeviceClass>(() =>
    typeof window !== 'undefined' ? detectDeviceClass(window.innerWidth) : 'desktop',
  );

  useEffect(() => {
    const onResize = () => setDevice(detectDeviceClass(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return device;
}
