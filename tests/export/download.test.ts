// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../src/export/download';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadBlob', () => {
  it('clicks a temporary download link, then revokes the object URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:poster');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });

    downloadBlob(blob, 'family-tree.svg');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('family-tree.svg');
    expect(clicked[0]!.href).toBe('blob:poster');
    expect(document.querySelector('a')).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster');
  });
});
