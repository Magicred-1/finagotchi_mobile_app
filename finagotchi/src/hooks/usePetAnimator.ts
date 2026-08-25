import { useEffect, useState } from 'react';

import { globalPetTime } from './usePetTime';

/**
 * Subscribe to the shared pet animation clock.
 *
 * Returns a monotonically increasing frame number. N components using this hook
 * share a single requestAnimationFrame loop, so mounting multiple pets does not
 * multiply rendering cost.
 */
export function usePetAnimator(): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    return globalPetTime.subscribe(() => {
      setFrame((f) => f + 1);
    });
  }, []);

  return frame;
}
