import type { ExitFn, FilterFn, IQueue, Queued } from './types';

/** Default exit function: noop */
const defaultExitFn: ExitFn<Queued> = _ => {};

/** Default filter function: counter-based filtering. */
const defaultFilterFn: FilterFn<Queued> = (item, q) => (item.counter ?? 0) >= q.counter;

export class Queue<T extends Queued> implements IQueue {
  #items:    T[] = [];
  #size:     number;
  #counter:  number;
  #exitFn:   ExitFn<T>;
  #filterFn: FilterFn<T>;

  constructor(exitFn: ExitFn<T> = defaultExitFn, size = 1000, counter = 0) {
    this.#exitFn   = exitFn;
    this.#size     = size;
    this.#counter  = counter;
    this.#filterFn = defaultFilterFn;
  }

  // ---- Getters / setters ------------------------------------------------

  get length():  number { return this.#items.length; }
  get size():    number { return this.#size; }
  get counter(): number { return this.#counter; }

  /** Reducing size below current length flushes the excess immediately. */
  set size(value: number) {
    this.#size = value;
    this.flush();
  }

  /** Changing the threshold re-evaluates exit eligibility on next flush. */
  set counter(value: number) {
    this.#counter = value;
    this.flush();
  }

  /** Custom filter function applied to items at exit. */
  set filterFn(fn: FilterFn<T>) {
    this.#filterFn = fn;
    this.flush();
  }

  // ---- Mutation ---------------------------------------------------------

  /**
   * Insert an item maintaining counter order, then flush any excess.
   *
   * In normal operation (items arrive in order) the insertion is O(1):
   * the new item has the highest counter, so it appends to the end in
   * a single iteration.
   */
  push(item: T): void {
    let i = this.#items.length;

    while (i > 0 && (this.#items[i - 1].counter ?? 0) > (item.counter ?? 0))
      i--;

    this.#items.splice(i, 0, item);
    this.flush();
  }

  /**
   * Atomically update exitFn, size, and counter threshold, then flush.
   * Omitted arguments retain their current values.
   */
  update(exitFn?: ExitFn<T>, size?: number, counter?: number): void {
    if (exitFn  !== undefined) this.#exitFn  = exitFn;
    if (size    !== undefined) this.#size    = size;
    if (counter !== undefined) this.#counter = counter;

    this.flush();
  }

  /**
   * Sugar for update(exitFn, 0, counter).
   *
   * Transitions the queue from accumulation to streaming: sets size to 0 so
   * every subsequent push exits immediately, and flushes all currently-queued
   * items through the counter filter and exitFn in one shot.
   * If counter is omitted, the current threshold is preserved.
   */
  stream(exitFn?: ExitFn<T>, counter?: number): void {
    this.update(exitFn, 0, counter);
  }

  /**
   * Eject any items in excess of size through the filter and exitFn.
   */
  flush(): void {
    while (this.#items.length > this.#size) {
      const item = this.#items.shift()!;

      if (this.#filterFn(item, this))
        this.#exitFn(item);
    }
  }
}
