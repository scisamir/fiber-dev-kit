export interface PollOptions {
    intervalMs?: number;
    timeoutMs?: number;
}
export declare function sleep(ms: number): Promise<void>;
/** Polls `fetch()` until `isResolved()` accepts a value, or throws once `timeoutMs` elapses. */
export declare function pollUntilResolved<T>(fetchValue: () => Promise<T>, isResolved: (value: T) => boolean, options?: PollOptions): Promise<T>;
