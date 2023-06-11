import { makeNoise2D } from "fast-simplex-noise";
import { chain, fromIO, tryCatchK } from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";

import { Timer, TimerCallback } from "./core";
import { WORKGROUP_SIZE, createShaderModules } from "./createShaderModules";
import { createRenderState, type RenderState } from "./lib";
import { clr, enumerate, v2 } from "./math";

import "./style.css";

const COMP = true;

const initScene = async ({ device, format, canvas }: RenderState) => {
  const { renderModule, smoothLifeLModule } = createShaderModules(device);

  const vertexArray = new Float32Array(
    [
      [v2.set([], -1, -1), clr.hex([], 0xff0000)],
      [v2.set([], +1, -1), clr.hex([], 0x00ff00)],
      [v2.set([], +1, +1), clr.hex([], 0x0000ff)],
      [v2.set([], -1, +1), clr.hex([], 0xffffff)],
    ].flat(2)
  );

  const vboLayout: GPUVertexBufferLayout = {
    arrayStride: Float32Array.BYTES_PER_ELEMENT * (2 + 4),
    attributes: [
      {
        format: "float32x2",
        offset: Float32Array.BYTES_PER_ELEMENT * 0,
        shaderLocation: 0,
      },
      {
        format: "float32x4",
        offset: Float32Array.BYTES_PER_ELEMENT * 2,
        shaderLocation: 1,
      },
    ],
  };
  const vbo = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vbo, 0, vertexArray);

  const indexArray = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const ibo = device.createBuffer({
    size: indexArray.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ibo, 0, indexArray);

  const bindGroupLayout = device.createBindGroupLayout({
    label: "bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });

  const layout = device.createPipelineLayout({
    label: "pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });

  const unitSize = Math.ceil(Math.max(1, (canvas.width * canvas.height) / 1e6));
  const size = v2.ceil(
    [],
    v2.scl([], v2.set([], canvas.width, canvas.height), 1 / unitSize)
  );
  const work = v2.ceil([], v2.scl([], size, 1 / WORKGROUP_SIZE));

  const ubo = device.createBuffer({
    size: Uint32Array.BYTES_PER_ELEMENT * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ubo, 0, new Uint32Array(size));

  const stateArray = new Float32Array(size[0] * size[1]);

  const noise = makeNoise2D(() => Math.random());
  const scale = 128;
  for (const [i, [x, y]] of enumerate(v2.it([], size))) {
    stateArray[i] = (noise(x / scale, y / scale) + Math.random()) / 2;
  }

  const appState = [
    device.createBuffer({
      size: stateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      size: stateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  ] as const;

  appState.forEach((b) => {
    device.queue.writeBuffer(b, 0, stateArray);
  });

  const bindGroups = [
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: ubo } },
        { binding: 1, resource: { buffer: appState[0] } },
        { binding: 2, resource: { buffer: appState[1] } },
      ],
    }),
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: ubo } },
        { binding: 1, resource: { buffer: appState[1] } },
        { binding: 2, resource: { buffer: appState[0] } },
      ],
    }),
  ];

  const [basePipeline, computePipeline] = await Promise.all([
    device.createRenderPipelineAsync({
      label: "pipeline",
      layout,
      vertex: {
        module: renderModule,
        entryPoint: "vert",
        buffers: [vboLayout],
      },
      fragment: {
        module: renderModule,
        entryPoint: "frag",
        targets: [{ format }],
      },
    }),
    device.createComputePipelineAsync({
      label: "smoothlife",
      layout,
      compute: {
        module: smoothLifeLModule,
        entryPoint: "main",
      },
    }),
  ]);

  return {
    computePipeline,
    basePipeline,
    bindGroups,
    work,
    vbo,
    ibo,
  };
};

class App {
  timer = new Timer();
  scene!: Awaited<ReturnType<typeof initScene>>;
  step = 0;

  constructor(public readonly gd: RenderState) {}

  async init() {
    this.scene = await initScene(this.gd);
  }

  render() {
    const { basePipeline, computePipeline, work, bindGroups, vbo, ibo } =
      this.scene;
    const { device, context } = this.gd;

    const encoder = device.createCommandEncoder();

    if (COMP) {
      const cmp = encoder.beginComputePass();
      cmp.setPipeline(computePipeline);
      cmp.setBindGroup(0, bindGroups[this.step]);
      cmp.dispatchWorkgroups(work[0], work[1]);
      cmp.end();
    }

    this.step ^= 1;

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          storeOp: "store",
          loadOp: "clear",
        },
      ],
    });

    pass.setPipeline(basePipeline);
    pass.setBindGroup(0, bindGroups[this.step]);
    pass.setVertexBuffer(0, vbo);
    pass.setIndexBuffer(ibo, "uint16");
    pass.drawIndexed(6);

    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  tick: TimerCallback = () => {
    this.render();
  };

  run() {
    this.timer.start(this.tick);
  }

  stop() {
    this.timer.stop();
  }
}

document.addEventListener(
  "DOMContentLoaded",
  pipe(
    fromIO(() => {
      const el = document.createElement("canvas");
      el.width = window.innerWidth;
      el.height = window.innerHeight;

      return el;
    }),
    chain(createRenderState),
    chain(
      tryCatchK(
        async (state) => {
          const app = new App(state);
          await app.init();

          document.body.appendChild(state.canvas);

          window.addEventListener("focus", app.run.bind(app), false);
          window.addEventListener("blur", app.stop.bind(app), false);

          app.run();
        },
        (e) => e as Error
      )
    )
  ),
  false
);
