import { invalidArgument } from './errors.js';

/** Single-reader buffer. Producers own polling, cancellation, and value copying. */
export class ObserverBuffer<T> {
  private readonly queue: { value: T; release?: () => void }[] = [];
  private ended = false;
  private error: unknown;
  private reading = false;
  private wake: (() => void) | undefined;

  constructor(
    private readonly capacity: number,
    private readonly overflow: () => Error,
    private readonly concurrentRead: () => Error = invalidArgument,
  ) {}

  get finished() {
    return this.ended;
  }

  push(value: T, reserve?: () => () => void) {
    if (this.ended) return;
    if (this.queue.length >= this.capacity) throw this.overflow();
    const release = reserve?.();
    this.queue.push({ value, ...(release ? { release } : {}) });
    this.wake?.();
  }

  /** Successful producer exhaustion leaves buffered values available to the reader. */
  end() {
    this.ended = true;
    this.wake?.();
  }

  /** Cancellation or failure discards buffered values and releases their reservations. */
  close(error?: unknown) {
    if (!this.ended) this.error = error;
    for (const row of this.queue) row.release?.();
    this.queue.length = 0;
    this.end();
  }

  async next(start: () => void | Promise<void>): Promise<IteratorResult<T>> {
    if (this.reading) throw this.concurrentRead();
    this.reading = true;
    try {
      if (!this.ended) await start();
      while (!this.queue.length && !this.ended) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      }
      if (this.error) throw this.error;
      const row = this.queue.shift();
      if (!row) return { done: true, value: undefined };
      row.release?.();
      return { done: false, value: row.value };
    } finally {
      this.reading = false;
      this.wake = undefined;
    }
  }
}
