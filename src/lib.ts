import type { Either, Right } from "fp-ts/Either";
import { Do, bind, of, tryCatchK, type TaskEither } from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";
import invariant from "tiny-invariant";

export const wgsl = String.raw;

export const createRenderState = (el: HTMLCanvasElement) =>
  pipe(
    Do,
    bind("canvas", () => of(el)),
    bind(
      "gpu",
      tryCatchK(
        async () => {
          const gpu = window.navigator.gpu;
          invariant(gpu, "WebGPU not supported");

          return gpu;
        },
        (e) => e as Error
      )
    ),
    bind("format", ({ gpu }) => of(gpu.getPreferredCanvasFormat())),
    bind(
      "adapter",
      tryCatchK(
        async ({ gpu }) => {
          const adapter = await gpu.requestAdapter();
          invariant(adapter, "Could not create adapter");

          return adapter;
        },
        (e) => e as Error
      )
    ),
    bind(
      "device",
      tryCatchK(
        async ({ adapter }) => {
          const device = await adapter.requestDevice();
          invariant(device, "Could not create device");

          return device;
        },
        (e) => e as Error
      )
    ),
    bind(
      "context",
      tryCatchK(
        async ({ canvas, device, format }) => {
          const ctx = canvas.getContext("webgpu");
          invariant(ctx, "Could not create context");

          ctx.configure({
            format,
            device,
          });

          return ctx;
        },
        (e) => e as Error
      )
    )
  );

type InferRight<T> = T extends Either<unknown, infer R>
  ? R
  : T extends Right<infer R>
  ? R
  : T extends TaskEither<unknown, infer R>
  ? R
  : never;

export type RenderState = InferRight<ReturnType<typeof createRenderState>>;
