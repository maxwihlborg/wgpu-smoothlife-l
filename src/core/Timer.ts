export interface TimerCallback {
  (elapsedTime: number, deltaTime: number): void;
}

export class Timer {
  private frameHandle = -1;
  elapsedTime = 0;
  deltaTime = 0;
  running = false;

  sync(dt: number, cb: TimerCallback) {
    this.elapsedTime += dt;
    this.deltaTime = dt;
    cb(this.elapsedTime, this.deltaTime);
  }

  start(cb: TimerCallback) {
    if (this.running) this.stop();
    this.running = true;

    let then = performance.now();
    const loop: FrameRequestCallback = (time) => {
      this.raf(loop);
      this.sync((time - then) * 1e-3, cb);
      then = time;
    };
    this.raf(loop);
  }

  raf(cb: FrameRequestCallback) {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(cb);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }
}
