import { Collection } from "./Collection";

export type Constructor<T = unknown> = { new (...args: any[]): T };
/* https://github.com/microsoft/TypeScript/issues/3841 */
/* eslint-disable-next-line @typescript-eslint/ban-types */
export type Constructable<T = unknown> = Function | Constructor<T>;

export type CollectionTypes<M> = { [K in keyof M]-?: M[K] extends Collection<any, any> ? K : never }[keyof M];
type Targets<M> = { [ P in keyof M]: any };
type Symbols<M> = { readonly [ P in keyof M]: string | symbol };

export class ReflectionScope<M, K extends Targets<M>> {
    private readonly symbols: Symbols<M>;

    constructor(symbols: Symbols<M>) {
        this.symbols = symbols;
    }

    public define<T extends keyof M>(metadataKey: T, value: M[T], target: K[T], key?: string | symbol) {
        if (typeof target !== "function" && !("constructor" in target))
            throw new Error(`Target is not a class constructor (found ${typeof target})`);

        let setValue: M[T] = value;
        if (value instanceof Collection)
            setValue = value.clone() as any;

        if (key)
            Reflect.defineMetadata(this.symbols[metadataKey], setValue, target, key);
        else
            Reflect.defineMetadata(this.symbols[metadataKey], setValue, target);
    }

    public get<T extends keyof M>(metadataKey: T, target: K[T], key?: string | symbol): M[T] | undefined {
        if (typeof target !== "function" && !("constructor" in target))
            throw new Error(`Target is not a class constructor (found ${typeof target})`);

        let meta;

        if (key)
            meta = Reflect.getMetadata(this.symbols[metadataKey], target, key);
        else
            meta = Reflect.getMetadata(this.symbols[metadataKey], target);

        return meta;
    }

    public getCollection<T extends CollectionTypes<M>>(key: T, target: K[T]): M[T] {
        let meta = this.get(key, target) as unknown as Collection<any, any>;

        if (meta === undefined)
            meta = new Collection();

        return meta.clone() as unknown as M[T];
    }

    public setCollection<T extends CollectionTypes<M>>(key: T, collection: M[T], target: K[T]) {
        this.define(key, (collection as unknown as Collection<any, any>).clone() as unknown as M[T], target);
    }
}
