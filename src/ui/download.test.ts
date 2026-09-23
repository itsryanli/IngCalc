import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadText } from './download';

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadText', () => {
  it('clicks a temporary link to the text, then releases the URL after a delay', () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      clicked = this;
    });

    downloadText('a.csv', 'text/csv;charset=utf-8', 'hello');

    const calls = create.mock.calls as (unknown[])[];
    const blob = calls[0]![0] as unknown as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(clicked!.download).toBe('a.csv');
    expect(clicked!.getAttribute('href')).toBe('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();

    // WebKit/iOS can cancel a download if its object URL is revoked too soon.
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
