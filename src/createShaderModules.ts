import { wgsl } from "./lib";

export const WORKGROUP_SIZE = Math.trunc(Math.sqrt(64));

export const createShaderModules = (device: GPUDevice) => {
  const RAD_A = 12;
  const RAD_I = RAD_A / 3;

  const renderModule = device.createShaderModule({
    label: "main-shader",
    code: wgsl`
      struct VertexInput {
        @location(0) pos: vec2f,
        @location(1) color: vec4f,
      }

      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(1) cell: vec2f,
        @location(0) color: vec3f,
      }

      @group(0) @binding(0) var<uniform> res: vec2u;
      @group(0) @binding(1) var<storage> state: array<f32>;

      @vertex
      fn vert(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;

        output.pos = vec4f(input.pos, 0, 1);
        output.cell = (input.pos+1)/2;
        output.color = input.color.xyz;

        return output;
      }

      @fragment
      fn frag(input: VertexOutput) -> @location(0) vec4f {
        let p = input.cell * vec2<f32>(res);
        let s = state[u32(p.x) + u32(p.y)*res.x];

        return vec4(input.color*s, 1);
      }
      `,
  });

  const smoothLifeModule = device.createShaderModule({
    label: "smoothlife-shader",
    code: wgsl`
      @group(0) @binding(0) var<uniform> resolution: vec2u;

      @group(0) @binding(1) var<storage, read> stateIn: array<f32>;
      @group(0) @binding(2) var<storage, read_write> stateOut: array<f32>;

      const b1:      f32 = 0.257;
      const b2:      f32 = 0.336;
      const d1:      f32 = 0.365;
      const d2:      f32 = 0.549;
      const alpha_n: f32 = 0.028;
      const alpha_m: f32 = 0.147;

      const dt: f32 = 0.1;

      const ra: f32 = ${RAD_A};
      const ri: f32 = ${RAD_I};

      const ra2 = ra*ra;
      const ri2 = ri*ri;

      const N: f32 = ${Math.PI * (RAD_A ** 2 - RAD_I ** 2)};
      const M: f32 = ${Math.PI * RAD_I ** 2};

      fn emod(v: i32, max: u32) -> u32 {
        return u32((v + i32(max)) % i32(max));
      }

      fn get_index(pos: vec2i) -> u32 {
        return emod(pos.x, resolution.x) + emod(pos.y, resolution.y) * resolution.x;
      }

      fn sig(x: f32, a: f32, alpha: f32) -> f32 {
        return 1.0/(1.0 + exp(-(x - a)*4.0/alpha));
      }

      fn sig_n(x: f32, a: f32, b: f32) -> f32 {
        return sig(x, a, alpha_n)*(1.0 - sig(x, b, alpha_n));
      }

      fn sig_m(x: f32, y: f32, m: f32) -> f32 {
        return x*(1 - sig(m, 0.5, alpha_m)) + y*sig(m, 0.5, alpha_m);
      }

      fn s(n: f32, m: f32) -> f32 {
        return sig_n(n, sig_m(b1, d1, m), sig_m(b2, d2, m));
      }

      @compute
      @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
      fn main(@builtin(global_invocation_id) pos: vec3u) {
        var m: f32 = 0;
        var n: f32 = 0;

        for (var dy = -ra; dy <= ra; dy += 1) {
          for (var dx = -ra; dx <= ra; dx += 1) {
            let p = vec2<f32>(pos.xy) + vec2(dx, dy);

            let r2 = dx*dx + dy*dy;

            if (r2 <= ri2) {
              m += stateIn[get_index(vec2<i32>(p))];
            } else if (r2 <= ra2) {
              n += stateIn[get_index(vec2<i32>(p))];
            }
          }
        }

        m /= M;
        n /= N;

        let q = s(n, m);
        let dv = 2 * q - 1;
        let i = get_index(vec2<i32>(pos.xy));

        stateOut[i] = clamp(stateIn[i] + dv*dt, 0, 1);
      }
      `,
  });

  const smoothLifeLModule = device.createShaderModule({
    label: "smooth-life-l",
    code: wgsl`
      @group(0) @binding(0) var<uniform> resolution: vec2u;

      @group(0) @binding(1) var<storage, read> stateIn: array<f32>;
      @group(0) @binding(2) var<storage, read_write> stateOut: array<f32>;

      const b1:      f32 = 0.257;
      const b2:      f32 = 0.336;
      const d1:      f32 = 0.365;
      const d2:      f32 = 0.549;
      const alpha_n: f32 = 0.028;
      const alpha_m: f32 = 0.147;

      const dt: f32 = 0.2;

      const ra: f32 = ${RAD_A};
      const ri: f32 = ${RAD_I};
      const rb: f32 = 1.0;

      const ra2 = ${RAD_A ** 2};
      const ri2 = ${RAD_I ** 2};

      const N: f32 = ${Math.PI * (RAD_A ** 2 - RAD_I ** 2)};
      const M: f32 = ${Math.PI * RAD_I ** 2};

      fn sig(x: f32, a: f32, alpha: f32) -> f32 { 
        return 1.0 / (1.0 + exp((a - x) * 4.0 / alpha));
      }

      fn sig_ab(x: f32, a: f32, b: f32) -> f32 {
        return sig(x, a, alpha_n) * (1.0 - sig(x, b, alpha_n));
      }

      fn sig_mix(x: f32, y: f32, m: f32) -> f32 {
        return mix(x, y, sig(m, 0.5, alpha_m));
      }

      fn s(n: f32, m: f32) -> f32 {
        return sig_mix(sig_ab(n, b1, b2), sig_ab(n, d1, d2), m);
      }

      fn emod(a: i32, b: u32) -> u32 {
        return u32((a + i32(b)) % i32(b));
      }

      fn get_index(pos: vec2i) -> u32 {
        return emod(pos.x, resolution.x) + emod(pos.y, resolution.y) * resolution.x;
      }

      fn func_linear(x: f32, a: f32, b: f32) -> f32 {
        if (x < a - b / 2) {
          return 0;
        }
        if (x > a + b / 2) {
          return 1;
        }
        return (x - a + b / 2) / b;
      }

      @compute
      @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
      fn main(@builtin(global_invocation_id) pos: vec3u) {
        var m: f32 = 0;
        var n: f32 = 0;

        for (var dy = -ra; dy <= ra; dy += 1) {
          for (var dx = -ra; dx <= ra; dx += 1) {
            let d = vec2(dx, dy);
            let r = length(d);

            let v = stateIn[get_index(vec2<i32>(pos.xy) + vec2<i32>(d))];

            let kr = func_linear(r, ri, rb);
            let ik = 1 - kr;
            let ak = (1 - func_linear(r, ra, rb)) * kr;

            m += v * ik;
            n += v * ak;
          }
        }

        m /= M;
        n /= N;

        let q = s(n, m);
        let dv = 2 * q - 1;
        let i = get_index(vec2<i32>(pos.xy));

        stateOut[i] = clamp(stateIn[i] + dv * dt, 0, 1);
      }
    `,
  });

  return {
    smoothLifeLModule,
    smoothLifeModule,
    renderModule,
  };
};
