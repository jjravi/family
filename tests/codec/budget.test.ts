import { describe, expect, it } from 'vitest';
import { encode } from '../../src/codec/encode';
import { SAMPLE_DSL } from '../../src/dsl/sample';
import { QR_MAX_BYTES, qrPlan } from '../../src/render/qr';
import { DEFAULT_STYLE } from '../../src/style';

const SITE = 'https://family.jostache.com/';

describe('share URL size budget', () => {
  it("keeps SAMPLE_DSL's full share URL within the QR budget", async () => {
    const url = `${SITE}#${await encode(SAMPLE_DSL, DEFAULT_STYLE)}`;
    expect(new TextEncoder().encode(url).length).toBeLessThan(QR_MAX_BYTES);
    expect(qrPlan(url)).not.toBeNull();
  });

  it('stays within the budget with every style param spelled out', async () => {
    const style = { layout: 'butterfly', theme: 'botanical', dates: false, traits: true, living: true, qr: true, size: '24x36', orientation: 'landscape' } as const;
    const url = `${SITE}#${await encode(SAMPLE_DSL, style)}`;
    expect(url.length).toBeLessThan(QR_MAX_BYTES);
    expect(qrPlan(url)).not.toBeNull();
  });
});
