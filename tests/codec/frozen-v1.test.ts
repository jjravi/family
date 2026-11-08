import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decode } from '../../src/codec/decode';
import { DEFAULT_STYLE } from '../../src/style';

/**
 * A real codec v1 share link, generated once on 2026-11-07 for the spec's
 * example tree. NEVER regenerate or edit it: framed prints carry v1 links like
 * this one for years, so every future version of decode() must read it
 * exactly. If this test fails, the change broke old links; fix the change.
 */
const FROZEN_V1_URL =
  'https://family.jostache.com/#v=1&l=butterfly&t=botanical&traits=1&size=24x36&d=dZHLTgMxDEX3-YqrqcSmQzUtFNouQDwEEg8JFX7AtG4bNeOgJAMKX4_DlCVZRLFzj-3cJJscL_C2YzzaFkdYdvYbd9Ral40Z4INCEg4RxxdY7axbB5YRbjmRdREtZbwztvaTBV6wsSEmtCzJauQDSDIcJQ56yyOz9LHvM56fTI4nzXiOam9lXWufGJVRaYUhrtyfqlFVM0YVE9M619h0Irkq0zxTyKqYTms8-J2U48z8JqsvCm2Ne792uVR78y1eKOyLZFLQVwq002jWKGsLOjsxh55DXHNKGU_Mmj9tiv6GgtPgbIrDGiBwSyFY2qp5kVqG6Fb3xw_1y0s_yxCXpcKVkBaYN_hnDdDJXvyX_Bluft-k5BP7Mt_sP7Kno5Wt4wKr98Zs_KqLi8M7h7ilT-4_djw_V8udz-RqrLpgfRcr8wM';

/** The exact text FROZEN_V1_URL holds (the spec's example DSL as of 2026-11-07). Frozen with it. */
const FROZEN_V1_DSL = `title: The Kim & Ruiz Family

# partners -> children. Details may be given on first mention or any later one.
Rose Kim 1932-2019 "kind, passionate" + Al Kim 1930-2001 "steady, funny" -> Mary 1955, John 1958
Mary "warm, Godly" + Tom Park 1952 -> Sarah 1980, Jin 1983
Al Kim + Betty Lee 1940 -> Carl 1965        # remarriage: same name, same person
Mary + ? -> Ana 1990                        # unknown partner
John -> Leo 1988                            # single parent

focus: Sarah + Dave Ruiz 1979 "loyal, curious"
`;

const FROZEN_V1_STYLE = { ...DEFAULT_STYLE, layout: 'butterfly', theme: 'botanical', traits: true, size: '24x36' };

const fragment = FROZEN_V1_URL.slice(FROZEN_V1_URL.indexOf('#') + 1);
const payload = new URLSearchParams(fragment).get('d')!;

describe('frozen v1 link', () => {
  it('decodes to the exact DSL and style', async () => {
    expect(await decode(fragment)).toEqual({ status: 'ok', dsl: FROZEN_V1_DSL, style: FROZEN_V1_STYLE, warnings: [] });
  });

  it('decodes from location.hash form and from the whole URL', async () => {
    const expected = { status: 'ok', dsl: FROZEN_V1_DSL, style: FROZEN_V1_STYLE, warnings: [] };
    expect(await decode(`#${fragment}`)).toEqual(expected);
    expect(await decode(FROZEN_V1_URL)).toEqual(expected);
  });

  it('is plain base64url of raw DEFLATE of UTF-8, readable by independent implementations', () => {
    expect(inflateRawSync(Buffer.from(payload, 'base64url')).toString('utf8')).toBe(FROZEN_V1_DSL);
  });

  it('keeps every v1 style param spelling', async () => {
    const all = await decode(`v=1&l=fan&t=modern&dates=0&traits=1&living=1&qr=0&size=a3&o=landscape&d=${payload}`);
    expect(all).toEqual({
      status: 'ok',
      dsl: FROZEN_V1_DSL,
      style: { layout: 'fan', theme: 'modern', dates: false, traits: true, living: true, qr: false, size: 'a3', orientation: 'landscape' },
      warnings: [],
    });
    const defaults = await decode(`v=1&d=${payload}`);
    expect(defaults).toEqual({ status: 'ok', dsl: FROZEN_V1_DSL, style: { ...DEFAULT_STYLE }, warnings: [] });
    const spelledOut = await decode(`v=1&l=desc&t=classic&dates=1&traits=0&living=0&qr=1&size=8x10&o=portrait&d=${payload}`);
    expect(spelledOut).toMatchObject({
      status: 'ok',
      style: { layout: 'desc', theme: 'classic', dates: true, traits: false, living: false, qr: true, size: '8x10', orientation: 'portrait' },
    });
  });
});
