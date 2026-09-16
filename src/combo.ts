/**
 * Tracks a typing combo: consecutive keystrokes within `timeoutMs` of each other.
 * Resets to zero after idle. Remembers the best combo seen.
 */
export class ComboTracker {
    private count = 0;
    private lastHit = 0;
    private best: number;

    constructor(private readonly timeoutMs: number, highScore = 0) {
        this.best = highScore;
    }

    hit(now: number): { combo: number; isRecord: boolean } {
        this.count = now - this.lastHit > this.timeoutMs ? 1 : this.count + 1;
        this.lastHit = now;
        const isRecord = this.count > this.best;
        if (isRecord) {
            this.best = this.count;
        }
        return { combo: this.count, isRecord };
    }

    reset(): void {
        this.count = 0;
    }

    get current(): number {
        return this.count;
    }

    get highScore(): number {
        return this.best;
    }
}
