import { Collection } from "./Collection";

export class CachedCollection<K, V> extends Collection<K, V> {
    public timeout: number;
    private readonly times: Collection<K, Date>;
    private readonly timeouts: Collection<K, NodeJS.Timeout>;

    constructor(timeout: number, limit?: number) {
        super(undefined, limit);
        this.timeout = timeout;
        this.times = new Collection();
        this.timeouts = new Collection();
    }

    getSetTime(key: K): Date | undefined {
        return this.times.get(key);
    }

    delete(key: K): boolean {
        if (!this.has(key)) return false;
        this.clearTimeout(key);
        return super.delete(key);
    }

    set(key: K, value: V): this {
        if (this.timeouts.has(key))
            this.clearTimeout(key);
        const timeout = setTimeout(() => this.delete(key), this.timeout);
        this.timeouts.set(key, timeout);
        this.times.set(key, new Date());
        return super.set(key, value);
    }

    private clearTimeout(key: K): void {
        const timeoutNumber = this.timeouts.get(key)!;
        clearTimeout(timeoutNumber);
        this.timeouts.delete(key);
    }
}
