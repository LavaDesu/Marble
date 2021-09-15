import { Lock } from "ramune";
import { Collection } from "./Collection";
import { Logger } from "./Logger";

type Constructor<T = unknown> = { new (...args: any[]): T };
/* https://github.com/microsoft/TypeScript/issues/3841 */
/* eslint-disable-next-line @typescript-eslint/ban-types */
type Constructable<T = unknown> = Function | Constructor<T>;

type MetadataMap = {
    DesignType: Constructable;
    DesignParamTypes: Constructable[];
    DesignReturnType: Constructable;
    Dependants: Collection<Constructable<Component>, string>;
    Dependencies: Collection<Constructable<Component>, string>;
    Exports: Collection<Constructable<Component>, string>;
    LoadPromise: Collection<Constructable<Component>, Lock>;
    Name: string;
    Provider: Provider;
    RequiresLoad: Lock;
};

type MetadataTargetMap = {
    DesignType: Component;
    DesignParamTypes: Component[];
    DesignReturnType: Component;
    Dependants: Component;
    Dependencies: Constructable<Component>;
    Exports: Constructable<Provider>;
    LoadPromise: Constructable<Provider>;
    Name: Constructable<Component>;
    Provider: Component;
    RequiresLoad: Constructable<Component>;
};

const MetadataSymbols = {
    DesignType: "design:type",
    DesignParamTypes: "design:paramtypes",
    DesignReturnType: "design:returntype",
    Dependants: Symbol("dependants"),
    Dependencies: Symbol("dependencies"),
    Exports: Symbol("exports"),
    LoadPromise: Symbol("loadPromise"),
    Name: Symbol("name"),
    Provider: Symbol("provider"),
    RequiresLoad: Symbol("requiresLoad")
} as const;

type MetadataType = keyof MetadataMap;
type MetadataCollectionType = keyof { [ P in keyof MetadataMap as MetadataMap[P] extends Collection<any, any> ? P : never ] : P };

const logger = new Logger("DI");

export namespace ReflectUtils {
    export function define<T extends MetadataType>(metadataKey: T, value: MetadataMap[T], target: MetadataTargetMap[T], key?: string | symbol) {
        if (typeof target !== "function" && !("constructor" in target))
            throw new Error(`Target is not a class constructor (found ${typeof target})`);

        let setValue: MetadataMap[T] = value;
        if (value instanceof Collection)
            setValue = value.clone() as any;

        if (key)
            Reflect.defineMetadata(MetadataSymbols[metadataKey], setValue, target, key);
        else
            Reflect.defineMetadata(MetadataSymbols[metadataKey], setValue, target);
    }

    export function get<T extends MetadataType>(metadataKey: T, target: MetadataTargetMap[T], key?: string | symbol): MetadataMap[T] | undefined {
        if (typeof target !== "function" && !("constructor" in target))
            throw new Error(`Target is not a class constructor (found ${typeof target})`);

        let meta;

        if (key)
            meta = Reflect.getMetadata(MetadataSymbols[metadataKey], target, key);
        else
            meta = Reflect.getMetadata(MetadataSymbols[metadataKey], target);

        return meta;
    }

    export function getCollection<T extends MetadataCollectionType>(key: T, target: MetadataTargetMap[T]): MetadataMap[T] {
        let meta = ReflectUtils.get(key, target);

        if (meta === undefined)
            meta = new Collection() as any;

        return meta!.clone() as MetadataMap[T];
    }

    export function setCollection<T extends MetadataCollectionType>(key: T, collection: MetadataMap[T], target: MetadataTargetMap[T]) {
        ReflectUtils.define(key, collection.clone() as any, target);
    }
}

export interface Component {
    // Added to allow basically any class be a Component
    constructor: any;
    load?(): void | Promise<void>;
    unload?(): void | Promise<void>;
}
export function Component(name?: string) {
    return function<T extends Constructable>(Base: T) {
        ReflectUtils.define("Name", name ?? Base.name, Base);
    };
}

export function ComponentLoad(target: Component, key: string, _descriptor: PropertyDescriptor) {
    const retType = ReflectUtils.get("DesignReturnType", target, key);
    if (retType !== Promise)
        return;

    const lock = new Lock();
    ReflectUtils.define("RequiresLoad", lock, target.constructor);
}

export function Dependency(target: Component, key: string): void {
    const depConstructor = ReflectUtils.get("DesignType", target, key)!;

    const deps = ReflectUtils.getCollection("Dependencies", target.constructor);
    deps.set(depConstructor, key);
    ReflectUtils.setCollection("Dependencies", deps, target.constructor);

    /* Old accessor-based on-demand dependency receiving
    descriptor.get = function(this: Component) {
        const provider = ReflectUtils.get("Provider", Object.getPrototypeOf(this));
        if (!provider)
            throw new Error(`No provider for ${Object.getPrototypeOf(this).name as string}!`);

        const dep = provider.getDependency(depConstructor);

        let depName: string = depConstructor.name;

        if ((dep as any)?.isComponent)
            depName = Object.getPrototypeOf(dep).name;

        if (!dep)
            throw new Error(`Missing dependency ${depName} for ${key} in ${Object.getPrototypeOf(target).name as string}`);

        return dep;
    };
    */
}

export function Export(target: Component, key: string) {
    const constructor = ReflectUtils.get("DesignType", target, key)!;
    const exports = ReflectUtils.getCollection("Exports", target.constructor);

    exports.set(constructor, key);

    ReflectUtils.setCollection("Exports", exports, target.constructor);
}

export function NeedsLoad(target: Provider, key: string) {
    const constructor = ReflectUtils.get("DesignType", target, key)!;

    let locks = ReflectUtils.getCollection("LoadPromise", target.constructor);
    if (!locks)
        locks = new Collection();

    locks.set(constructor, new Lock());

    ReflectUtils.setCollection("LoadPromise", locks, target.constructor);
}

export interface Provider {
    getDependency<T>(dep: Constructable<T>): T | undefined;
    load?(): void | Promise<void>;
    markReady(component: Constructable): void;
    unload?(): void | Promise<void>;
    unloadComponent(component: Constructable): void;
}
export function Provider<T extends Constructor<any>>(Base: T) {
    return class extends Base implements Provider {
        constructor(...args: any[]) {
            super(...args);

            if (!ReflectUtils.get("Name", this.constructor))
                this.load();
        }

        async load() {
            logger.debug(`[${ReflectUtils.get("Name", this.constructor) ?? Base.name}] Loading Provider`);
            const exports = ReflectUtils.getCollection("Exports", Base);

            await exports.asyncMap(async key => await this.inject(this[key]));
            await super.load?.();
        }

        markReady(constructor: Constructable) {
            const locks = ReflectUtils.getCollection("LoadPromise", Base);
            const lock = locks.get(constructor);
            if (!lock)
                throw new Error("Missing load promise, is this marked with @NeedsLoad?");

            lock.resolve();
        }

        async inject(component: Component) {
            ReflectUtils.define("Provider", this, component);

            const constructor = component.constructor;

            const deps = ReflectUtils.getCollection("Dependencies", constructor);
            await deps.asyncMap(async (key, dep) => {
                const dependency = this.getDependency(dep)!;

                const depDepandants = ReflectUtils.getCollection("Dependants", dependency);
                depDepandants.set(component.constructor, key);
                ReflectUtils.setCollection("Dependants", depDepandants, dependency);

                let depName: string = ReflectUtils.get("Name", dep)!;

                if (!depName)
                    depName = dep.name;

                if (!dependency)
                    throw new Error(`Missing dependency ${depName} for ${key} in ${ReflectUtils.get("Name", constructor)!}`);

                const internalLocks = ReflectUtils.getCollection("LoadPromise", Base);
                const depLock = ReflectUtils.get("RequiresLoad", dep);

                const lock = internalLocks.get(dep) ?? depLock;
                if (depLock)
                    logger.debug(`[${ReflectUtils.get("Name", constructor)!}] Waiting for ${depName}`);

                if (lock)
                    await lock.promise;

                (component as any)[key] = dependency;
            });

            if (component.load !== undefined) {
                const res = component.load?.();
                if (res instanceof Promise) {
                    const lock: Lock = ReflectUtils.get("RequiresLoad", component.constructor)!;
                    if (!lock)
                        throw new Error(`Async load without @ComponentLoad in ${component.constructor.name as string}`);

                    logger.debug(`[${ReflectUtils.get("Name", constructor)!}] Awaiting`);
                    await res;
                    lock.resolve();
                }
                logger.debug(`[${ReflectUtils.get("Name", constructor)!}] Loaded`);
            }
        }

        getDependency<U>(dep: Constructable<U>): U | undefined {
            const exports = ReflectUtils.getCollection("Exports", Base);
            const parent = ReflectUtils.get("Provider", this);

            const key = exports.get(dep);
            if (!key)
                return parent?.getDependency(dep);
            return this[key];
        }

        async unloadComponent(constructor: Constructable<Component>) {
            const component = this.getDependency(constructor);
            if (!component)
                return;

            logger.debug(`Preparing to unload ${constructor.name}`);

            const depts = ReflectUtils.getCollection("Dependants", component);

            for (const [dep] of depts)
                await this.unloadComponent(dep);

            logger.debug(`Unloading ${constructor.name as string}`);
            await component?.unload?.();

            const exports = ReflectUtils.getCollection("Exports", Base);
            exports.delete(constructor);
            ReflectUtils.setCollection("Exports", exports, Base);

            logger.debug(`Unloaded ${constructor.name as string}`);
        }

        async unload() {
            logger.debug(`Preparing to unload provider ${Base.name}`);

            for (const [constructor] of ReflectUtils.getCollection("Exports", Base))
                await this.unloadComponent(constructor);

            logger.debug(`Unloading provider ${Base.name}`);
            await super.unload?.();

            logger.debug(`Unloaded provider ${Base.name}`);
        }
    };
}
