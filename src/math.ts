export type v2 = [x: number, y: number];
export type v2i = v2 | number[] | Float32Array;

export const v2 = {
  create: (): v2 => {
    return [0, 0];
  },
  set: (out: v2i, x: number, y: number): v2 => {
    out[0] = x;
    out[1] = y;
    return out as v2;
  },
  scl: (out: v2i, a: Readonly<v2>, n: number) => {
    out[0] = a[0] * n;
    out[1] = a[1] * n;
    return out as v2;
  },
  ceil: (out: v2i, a: Readonly<v2>) => {
    out[0] = Math.ceil(a[0]);
    out[1] = Math.ceil(a[1]);
    return out as v2;
  },
  copy: (out: v2i, a: Readonly<v2i>) => {
    out[0] = a[0];
    out[1] = a[1];
    return out as v2;
  },
  *it(out: v2i, a: v2) {
    const ym = Math.max(0, a[1]);
    const xm = Math.max(0, a[0]);

    for (let y = 0; y < ym; ++y) {
      for (let x = 0; x < xm; ++x) {
        yield v2.set(out, x, y);
      }
    }
  },
};

export function* enumerate<T>(
  n: Iterable<T>
): Generator<[index: number, value: T], void, unknown> {
  let i = 0;
  for (const c of n) {
    yield [i++, c];
  }
}

export type clr = [r: number, g: number, b: number, a: number];

export const clr = {
  hex(out: clr | number[], hex: number, alpha = 1) {
    out[0] = ((hex >> 16) & 0xff) / 0xff;
    out[1] = ((hex >> 8) & 0xff) / 0xff;
    out[2] = ((hex >> 0) & 0xff) / 0xff;
    out[3] = alpha;
    return out as clr;
  },
};
