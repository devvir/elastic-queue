# @devvir/elastic-queue

Bounded queue with customizable ordering and filtering at exit. Buffer items up to a size limit, then process them through a filter function. Items that pass the filter are forwarded to your exit function. Perfect for scenarios requiring gap detection, deduplication, or conditional processing of streamed data.

## How it works

```
item → push → [  queue  ] → overflow → filterFn → (dropped | exitFn)
```

Items are stored FIFO (first-in, first-out), or optionally ordered by `counter` if items have that property. When the queue exceeds its size limit, the oldest item exits. Items are **never rejected** — the queue is *bounded by exit*, not by input. Automatic flush on push ensures the queue never grows beyond its size limit.

At exit, each item passes through `filterFn`. If the filter returns `true`, the item goes to `exitFn` for processing. If `false`, the item is silently dropped.

`exitFn`, `size`, and `counter` can be changed atomically via `update()` — all three are updated together and trigger a single flush. Setting `size=0` via `update()` or `stream()` is especially useful to transition from buffering to streaming mode (every push exits immediately).

## Optional extra functionality

Out of the box, `Queue` buffers items in FIFO order, ensuring excess items are dropped, until you're ready to consume them. Optionally, the following features are provided:

### Source-defined ordering instead of FIFO

- If items have a `counter` property, the queue enforces ascending order by `counter` at insertion, mitigating out-of-order arrivals
- The queue's `counter` threshold can be set at construction, via `update()`, or directly via its setter to adjust the default counter-based filtering

**Use case**

You receive an inbound stream but don't yet know the filtering criteria:
- Buffer incoming items while waiting for additional parameters
- Once ready, set the `exitFn` and `counter` threshold to begin processing

### User defined filter function

Override the default counter-based filter with custom logic to drop items based on your criteria.

```typescript
queue.filterFn = (item: Queued, queue: IQueue) => myOwnFilteringLogic(item, queue);
```

**Use case**

The filtering criteria is not defined by the time we start consuming items, but we want to buffer them until it is. Once we have all we need, we set the filter and functions and start processing items.

### Combining optional features

By controlling the size, counter, filter function, and exit function, you can transition through a service's lifecycle. For example, initialize the queue with a size but keep the default `filterFn` (no-op) until ready to filter.

Once filtering logic is finalized, call `stream()` to transition to streaming mode (filtering without buffering), or call `update()` with a smaller size, depending on your needs.

## Usage: Buffering with Threshold Filtering

Buffer items and only process those above a certain sequence number (useful for gap detection):

```typescript
import { Queue } from '@devvir/elastic-queue';

interface Update {
  counter?: number;
  data: string;
}

// Accumulate updates silently
const q = new Queue<Update>();

// Push updates while processing something else
q.push({ counter: 1, data: 'update-1' });
q.push({ counter: 2, data: 'update-2' });
q.push({ counter: 3, data: 'update-3' });

// Once baseline state is ready (at counter 2):
// - Flush all updates in queue
// - Drop updates before counter 2 (already included in baseline)
// - Forward updates from counter 2+ (gap coverage)
q.stream(
  (update) => console.log('Process:', update.data),
  2  // threshold: only forward items with counter >= 2
);
// → outputs: 'Process: update-2', 'Process: update-3'

// Subsequent pushes process immediately through the filter
q.push({ counter: 4, data: 'update-4' }); // → outputs: 'Process: update-4'
```

## Usage: Custom Filtering

By default, items are filtered by counter threshold. You can replace the filter with custom logic for any criteria:

```typescript
// Filter by item property
q.filterFn = (item) => item.priority === 'high';

// Filter by queue state (e.g., only forward if backlog exists)
q.filterFn = (item, queue) => queue.length > 1;

// Combine item and queue logic
q.filterFn = (item, queue) => {
  return item.retries < 3 && queue.length < queue.size;
};
```

The filter function receives:
- `item`: Each item being evaluated for exit
- `queue`: The queue instance (read `counter`, `size`, `length`)

Return `true` to forward the item to `exitFn`, `false` to drop/discard it silently.


## API

### Constructor

```typescript
constructor(exitFn?: ExitFn<T>, size?: number, counter?: number)
```

- `exitFn`: Function called with each item that passes the filter (default: no-op)
- `size`: Maximum queue capacity before oldest item exits (default: 1000)
- `counter`: Threshold for default counter-based filter (default: 0)

### Methods

- `push(item: T)`: Add item to queue and flush any excess
- `stream(exitFn, counter?)`: Transition to streaming: set `size=0`, new `exitFn`, and optional new `counter`
- `update(exitFn?, size?, counter?)`: Atomically change any parameters and flush
- `flush()`: Immediately process items exceeding `size` through the filter

### Properties (Getters & Setters)

- `length: number` — Current queue length (read-only)
- `size: number` — Max capacity; setter flushes excess
- `counter: number` — Threshold for default filter; setter triggers flush
- `filterFn: FilterFn<T>` — Exit filter function; setter triggers flush

### Types

```typescript
interface Queued {
  counter?: number;
}

type ExitFn<T extends Queued> = (item: T) => void;

type FilterFn<T extends Queued> = (item: T, queue: IQueue<T>) => boolean;

interface IQueue<T extends Queued> {
  readonly counter: number;
  readonly size: number;
  readonly length: number;
}
```

**Default filter:** `(item, queue) => (item.counter ?? 0) >= queue.counter`
