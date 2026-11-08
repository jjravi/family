import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/ui/debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('runs once, `wait` ms after the last call, with that call’s arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('a');
    vi.advanceTimersByTime(200);
    debounced('b');
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    expect(debounced.pending).toBe(true);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    expect(debounced.pending).toBe(false);
  });

  it('cancel() drops the waiting call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(debounced.pending).toBe(false);
  });

  it('flush() runs the waiting call now, and does nothing when none waits', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
    debounced(1);
    debounced.flush();
    expect(fn).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
