// Waiting-list ordering and wait-time estimation.

export const PRIORITY = { emergency: 0, appointment: 1, walkin: 2 };

/** Binary min-heap ordered by (priority, arrivalTime). */
export class WaitingQueue {
  #heap = [];

  static #less(a, b) {
    return a.priority !== b.priority ? a.priority < b.priority : a.arrivedAt < b.arrivedAt;
  }

  get size() {
    return this.#heap.length;
  }

  peek() {
    return this.#heap[0] ?? null;
  }

  push(item) {
    const h = this.#heap;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!WaitingQueue.#less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  pop() {
    const h = this.#heap;
    if (h.length === 0) return null;
    const top = h[0];
    const last = h.pop();
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && WaitingQueue.#less(h[l], h[m])) m = l;
        if (r < h.length && WaitingQueue.#less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }

  /** Items in service order, without mutating the queue. */
  toSortedArray() {
    const copy = new WaitingQueue();
    this.#heap.forEach((x) => copy.push(x));
    const out = [];
    for (let x = copy.pop(); x; x = copy.pop()) out.push(x);
    return out;
  }
}

/** Exponential moving average of consultation durations (minutes). */
export const updateAverageDuration = (previousAvg, lastDuration, alpha = 0.3) =>
  previousAvg == null ? lastDuration : alpha * lastDuration + (1 - alpha) * previousAvg;

/** Estimated wait for the patient at 1-based `position`. */
export const estimateWaitMinutes = (position, avgDuration) =>
  Math.max(0, position - 1) * avgDuration;
