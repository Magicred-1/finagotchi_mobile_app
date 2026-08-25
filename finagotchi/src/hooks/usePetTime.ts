/**
 * Global clock-free animation time source.
 *
 * All pet components share a single requestAnimationFrame loop. The loop starts
 * when the first component subscribes and stops when the last one unmounts.
 */

type Listener = (timeMs: number) => void;

const FRAME_INTERVAL_MS = 33; // ~30 fps

class GlobalTime {
  private listeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastRealTime = Date.now();
  private timeMs = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.timeMs);

    if (this.listeners.size === 1) {
      this.start();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  private start(): void {
    this.lastRealTime = Date.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = (): void => {
    const now = Date.now();
    const delta = now - this.lastRealTime;

    if (delta >= FRAME_INTERVAL_MS) {
      this.timeMs += FRAME_INTERVAL_MS;
      this.lastRealTime = now;
      this.listeners.forEach((listener) => listener(this.timeMs));
    }

    this.rafId = requestAnimationFrame(this.loop);
  };
}

export const globalPetTime = new GlobalTime();
