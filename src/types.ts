export interface Queued {
  counter?: number;
}

/**
 * Public queue interface for type compatibility.
 * Represents the observable state of a Queue.
 */
export interface IQueue {
  readonly counter: number;
  readonly size: number;
  readonly length: number;
}

/**
 * Filter function determines whether items are forwarded to exitFn or dropped.
 */
export type FilterFn<T extends Queued> = (item: T, queue: IQueue) => boolean;

/**
 * Exit function receives flushed items that passed the FilterFn test.
 */
export type ExitFn<T extends Queued> = (item: T) => void;

