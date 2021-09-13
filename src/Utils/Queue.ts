import { Collection } from "./Collection";

type Callback<T> = (arg: T) => void | Promise<void>;

export class Queue<T> {
    private readonly customCallbacks: Collection<T, Callback<T>>;
    private readonly defaultCallback: Callback<T>;
    private readonly defaultTimeout: number;
    private readonly queue: Collection<T, NodeJS.Timeout>;

    constructor(callback: Callback<T>, defaultTimeout: number) {
        this.customCallbacks = new Collection();
        this.defaultCallback = callback;
        this.defaultTimeout = defaultTimeout;
        this.queue = new Collection();
    }
    public add(key: T): this {
        this.queue.set(key, setTimeout(async () => await this.call(key), this.defaultTimeout));
        return this;
    }
    public addCustom(key: T, callback: Callback<T>): this {
        this.customCallbacks.set(key, callback);
        this.add(key);
        return this;
    }
    public async clear(): Promise<this> {
        await Promise.all(this.queue.keysAsArray().map(async key => await this.call(key)));
        return this;
    }
    private async call(key: T) {
        clearTimeout(this.queue.get(key)!);
        const customCallback = this.customCallbacks.get(key);
        if (customCallback)
            await customCallback(key);
        else
            await this.defaultCallback(key);
        this.queue.delete(key);
    }
}
