import { useEffect, useState } from 'react';

import { globalPetTime } from './usePetTime';

/**
 * Subscribe to the shared pet animation clock.
 *
 * Returns a monotonically increasing frame number. N components using this hook
 * share a single requestAnimationFrame loop, so mounting multiple pets does not
 * multiply rendering cost.
 *
 * Pass `active = false` while the animated content is not visible (e.g. a
 * closed modal): the subscription — and with it the shared loop, when it was
 * the last one — stops instead of re-rendering a hidden tree at 30 fps.
 */
export function usePetAnimator(active = true): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    return globalPetTime.subscribe(() => {
      setFrame((f) => f + 1);
    });
  }, [active]);

  return frame;
}
