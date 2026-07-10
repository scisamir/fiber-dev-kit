export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `fetch()` until `isResolved()` accepts a value, or throws once `timeoutMs` elapses. */
export async function pollUntilResolved<T>(
  fetchValue: () => Promise<T>,
  isResolved: (value: T) => boolean,
  options: PollOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;

  let value = await fetchValue();
  while (!isResolved(value)) {
    if (Date.now() >= deadline) {
      throw new Error(`pollUntilResolved: condition not met within ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
    value = await fetchValue();
  }
  return value;
}
