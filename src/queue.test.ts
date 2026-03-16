import { describe, it, expect } from 'vitest';
import { Queue } from './queue';
import type { Queued } from './types';

// ---- Helpers ---------------------------------------------------------------

const item = (counter: number) => ({ counter });

// ---- Tests -----------------------------------------------------------------

describe('Queue — push and overflow', () => {
  it('accumulates items up to its size', () => {
    const q   = new Queue(undefined, 3);
    const out: number[] = [];

    q.push(item(1));
    q.push(item(2));
    q.push(item(3));

    expect(q.length).toBe(3);
    expect(out).toHaveLength(0);
  });

  it('exits oldest item when size is exceeded', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 2);

    q.push(item(1));
    q.push(item(2));
    q.push(item(3)); // overflow: counter=1 exits

    expect(q.length).toBe(2);
    expect(out).toEqual([1]);
  });

  it('drops exited item when its counter is below threshold', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 1, 5);

    q.push(item(3)); // fills queue
    q.push(item(6)); // counter=3 exits, 3 < 5 → dropped

    expect(out).toHaveLength(0);
  });

  it('forwards exited item when its counter meets threshold', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 1, 5);

    q.push(item(5)); // fills queue
    q.push(item(6)); // counter=5 exits, 5 >= 5 → forwarded

    expect(out).toEqual([5]);
  });
});

describe('Queue — update', () => {
  it('setting size=0 flushes all items through current exitFn', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>();

    q.push(item(1));
    q.push(item(2));
    q.push(item(3));

    q.update(i => out.push(i.counter), 0);

    expect(q.length).toBe(0);
    expect(out).toEqual([1, 2, 3]);
  });

  it('counter filter applies during flush', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>();

    q.push(item(3));
    q.push(item(7));
    q.push(item(11));

    q.update(i => out.push(i.counter), 0, 7); // drop < 7, forward >= 7

    expect(out).toEqual([7, 11]);
  });

  it('reducing size flushes only the excess', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 5);

    for (let i = 1; i <= 5; i++) q.push(item(i));

    q.update(undefined, 3); // shrink by 2: exits 1 and 2

    expect(out).toEqual([1, 2]);
    expect(q.length).toBe(3);
  });
});

describe('Queue — stream (sugar for update(exitFn, 0, counter))', () => {
  it('is equivalent to update(exitFn, 0, counter)', () => {
    const out1: number[] = [];
    const out2: number[] = [];

    const q1 = new Queue<{ counter: number }>();
    const q2 = new Queue<{ counter: number }>();

    for (let i = 1; i <= 5; i++) { q1.push(item(i)); q2.push(item(i)); }

    q1.stream(i => out1.push(i.counter), 3);
    q2.update(i => out2.push(i.counter), 0, 3);

    expect(out1).toEqual(out2);
  });

  it('subsequent pushes exit immediately and pass through the filter', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>();

    q.stream(i => out.push(i.counter), 5);

    q.push(item(4)); // 4 < 5 → dropped
    q.push(item(5)); // 5 >= 5 → forwarded
    q.push(item(9)); // 9 >= 5 → forwarded

    expect(out).toEqual([5, 9]);
    expect(q.length).toBe(0);
  });
});

describe('Queue — getters and setters', () => {
  it('exposes size, counter, and length', () => {
    const q = new Queue(undefined, 10, 5);

    q.push(item(6));
    q.push(item(7));

    expect(q.size).toBe(10);
    expect(q.counter).toBe(5);
    expect(q.length).toBe(2);
  });

  it('size setter flushes excess immediately', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 5);

    for (let i = 1; i <= 5; i++) q.push(item(i));

    q.size = 3; // shrink: exits 1 and 2

    expect(out).toEqual([1, 2]);
    expect(q.length).toBe(3);
  });

  it('counter setter updates the filter applied on subsequent flushes', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 1, 0);

    q.push(item(3)); // fills queue (size=1)
    q.counter = 10;  // raise threshold

    q.push(item(5)); // overflow: counter=3 exits, 3 < 10 → dropped

    expect(out).toHaveLength(0);
  });
});

describe('Queue — flush', () => {
  it('flush() is a no-op when length <= size', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 5);

    q.push(item(1));
    q.push(item(2));
    q.flush();

    expect(out).toHaveLength(0);
    expect(q.length).toBe(2);
  });
});

describe('Queue — counter-free items (plain FIFO)', () => {
  it('accepts items without a counter and behaves as a plain bounded FIFO', () => {
    const out: string[] = [];
    const q = new Queue<{ id: string } & Queued>(i => out.push(i.id), 2);

    q.push({ id: 'a' });
    q.push({ id: 'b' });
    q.push({ id: 'c' }); // overflow: 'a' exits

    expect(out).toEqual(['a']);
    expect(q.length).toBe(2);

    q.stream(i => out.push(i.id));

    expect(out).toEqual(['a', 'b', 'c']);
  });
});

describe('Queue — ordering on insert', () => {
  it('inserts out-of-order items in sorted position', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 2);

    q.push(item(10));
    q.push(item(5));  // arrives out of order
    q.push(item(15)); // overflow: counter=5 exits first (oldest)

    expect(out).toEqual([5]);
  });
});

describe('Queue — filterFn (custom filtering)', () => {
  it('defaults to counter-based filtering', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 2, 5);

    q.push(item(3));
    q.push(item(7)); // overflow: 3 < 5 → dropped

    expect(out).toHaveLength(0);
  });

  it('allows custom filterFn based on item properties', () => {
    interface Item extends Queued {
      counter?: number;
      color: string;
    }

    const out: string[] = [];
    const q = new Queue<Item>(i => out.push(i.color), 1);

    // Only pass through red items
    q.filterFn = (item) => item.color === 'red';

    q.push({ counter: 1, color: 'red' });
    q.push({ counter: 2, color: 'blue' }); // overflow: red passes, blue dropped

    expect(out).toEqual(['red']);
  });

  it('allows filterFn to access queue properties', () => {
    const out: number[] = [];
    const q = new Queue<{ counter: number }>(i => out.push(i.counter), 3);

    q.push(item(1));
    q.push(item(2));

    // Only forward if queue has more than 1 item (never flush when singular)
    q.filterFn = (_, queue) => queue.length > 1;

    q.push(item(3));
    q.push(item(4)); // overflow, but queue.length still > 1 after shift, so forwards

    expect(out).toEqual([1]);
  });

  it('changing filterFn triggers flush with new logic', () => {
    interface Item extends Queued {
      counter?: number;
      id: string;
    }

    const out: string[] = [];
    const q = new Queue<Item>(i => out.push(i.id), 1000, 5);

    q.push({ counter: 3, id: 'a' });
    q.push({ counter: 7, id: 'b' });

    // Switch to a custom filter and set size=0 to flush all with new logic
    q.filterFn = (item) => item.id === 'b'; // only pass 'b'
    q.size = 0; // forces flush of all items with new filter

    expect(out).toEqual(['b']);
  });

  it('works with stream transition', () => {
    interface Item extends Queued {
      counter?: number;
      value: number;
    }

    const out: number[] = [];
    const q = new Queue<Item>();

    q.filterFn = (item) => item.value > 100;

    q.push({ counter: 1, value: 50 });
    q.push({ counter: 2, value: 150 });

    q.stream(i => out.push(i.value), 0);

    expect(out).toEqual([150]);
  });
});
