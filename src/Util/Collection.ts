export class Collection<K, V> extends Map<K, V> {
    public limit: number;
    constructor(iterable?: Iterable<readonly [K, V]>, limit?: number) {
        if (iterable)
            super(iterable);
        else
            super();
        this.limit = limit ?? 0;
    }

    random(): { key: K; value: V } | null {
        if (!this.size)
            return null;

        const entry = [...this.entries()][Math.floor(Math.random() * this.size)];
        return {
            key: entry[0],
            value: entry[1]
        };
    }

    static fromObj<V>(obj: { [name: string]: V }): Collection<string, V> {
        const res: Collection<string, V> = new Collection();

        for (const key in obj)
            res.set(key, obj[key]);

        return res;
    }

    getOrSet(key: K, value: V): V {
        if (this.has(key)) return this.get(key)!;
        this.set(key, value);
        return value;
    }

    placehold(key: K): this {
        this.set(key, undefined as unknown as V);
        return this;
    }
    set(key: K, value: V): this {
        if (this.limit !== 0 && this.size > this.limit)
            this.delete(this.random()!.key);

        super.set(key, value);
        return this;
    }

    entriesArray(): [K, V][] {
        return [...this.entries()];
    }
    keysAsArray(): K[] {
        return [...this.keys()];
    }
    valuesAsArray(): V[] {
        return [...this.values()];
    }

    async asyncMap<T>(callback: (value: V, key: K, index: number) => Promise<T>): Promise<T[]> {
        return await Promise.all(this.map(callback));
    }
    map<T>(callback: (value: V, key: K, index: number) => T): T[] {
        const ret = [];
        let index = 0;
        for (const entry of this.entries())
            ret.push(callback(entry[1], entry[0], index++));

        return ret;
    }
}

