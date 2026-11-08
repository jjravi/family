/** A debounced function (see debounce()). */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drops the waiting call, if any. */
  cancel(): void;
  /** Runs the waiting call now, if any. */
  flush(): void;
  /** True while a call is waiting. */
  readonly pending: boolean;
}

/**
 * Coalesces bursts of calls: `fn` runs once, `wait` ms after the last call,
 * with that call's arguments.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: A | undefined;

  const fire = (): void => {
    const args = waiting as A;
    timer = undefined;
    waiting = undefined;
    fn(...args);
  };

  const debounced = (...args: A): void => {
    waiting = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, wait);
  };

  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    waiting = undefined;
  };

  const flush = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    fire();
  };

  return Object.defineProperties(debounced, {
    cancel: { value: cancel },
    flush: { value: flush },
    pending: { get: () => timer !== undefined },
  }) as Debounced<A>;
}
