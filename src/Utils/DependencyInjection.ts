import { Lock } from "ramune";
import { Collection } from "./Collection";
import { Logger } from "./Logger";
import { Constructable, Constructor, ReflectionScope } from "./Reflection";

type MetadataMap = {
    DesignType: Constructable;
    DesignParamTypes: Constructable[];
    DesignReturnType: Constructable;
    Dependants: Collection<Constructable<Component>, string>;
    Dependencies: Collection<Constructable<Component>, string>;
    LooseDependencies: Collection<Constructable<Component>, string | undefined>;
    Exports: Collection<Constructable<Component>, string>;
    LoadPromise: Collection<Constructable<Component>, Lock>;
    Name: string;
    PreUnload: string;
    Provider: Provider;
    RequiresLoad: Lock;
};

type MetadataTargetMap = {
    DesignType: Component;
    DesignParamTypes: Component;
    DesignReturnType: Component;
    Dependants: Component;
    Dependencies: Constructable<Component>;
    LooseDependencies: Constructable<Component>;
    Exports: Constructable<Provider>;
    LoadPromise: Constructable<Provider>;
    Name: Constructable<Component>;
    PreUnload: Constructable<Provider>;
    Provider: Component;
    RequiresLoad: Constructable<Component>;
};

const MetadataSymbols = {
    DesignType: "design:type",
    DesignParamTypes: "design:paramtypes",
    DesignReturnType: "design:returntype",
    Dependants: Symbol("dependants"),
    Dependencies: Symbol("dependencies"),
    LooseDependencies: Symbol("looseDependencies"),
    Exports: Symbol("exports"),
    LoadPromise: Symbol("loadPromise"),
    Name: Symbol("name"),
    PreUnload: Symbol("preUnload"),
    Provider: Symbol("provider"),
    RequiresLoad: Symbol("requiresLoad")
} as const;

const Reflector = new ReflectionScope<MetadataMap, MetadataTargetMap>(MetadataSymbols);
export { Reflector as DIReflector };
const logger = new Logger("DI");

export interface Component {
    // Added to allow basically any class be a Component
    constructor: any;
    load?(): void | Promise<void>;
    unload?(): void | Promise<void>;
}
export function Component(name?: string) {
    return function<T extends Constructable>(Base: T) {
        Reflector.define("Name", name ?? Base.name, Base);
    };
}

export function ComponentLoad(target: Component, key: string, _descriptor: PropertyDescriptor) {
    const retType = Reflector.get("DesignReturnType", target, key);
    if (retType !== Promise)
        return;

    const lock = new Lock();
    Reflector.define("RequiresLoad", lock, target.constructor);
}

export function Dependency(target: Component, key: string) {
    const depConstructor = Reflector.get("DesignType", target, key)!;

    const deps = Reflector.getCollection("Dependencies", target.constructor);
    deps.set(depConstructor, key);
    Reflector.setCollection("Dependencies", deps, target.constructor);
}

export function LooseDependency(target: Component, key: string) {
    const depConstructor = Reflector.get("DesignType", target, key)!;

    const deps = Reflector.getCollection("LooseDependencies", target.constructor);
    deps.set(depConstructor, key);
    Reflector.setCollection("LooseDependencies", deps, target.constructor);
}

export function Export(target: Component, key: string) {
    const constructor = Reflector.get("DesignType", target, key)!;
    const exports = Reflector.getCollection("Exports", target.constructor);

    exports.set(constructor, key);

    Reflector.setCollection("Exports", exports, target.constructor);
}

export function NeedsLoad(target: Provider, key: string) {
    const constructor = Reflector.get("DesignType", target, key)!;

    let locks = Reflector.getCollection("LoadPromise", target.constructor);
    if (!locks)
        locks = new Collection();

    locks.set(constructor, new Lock());

    Reflector.setCollection("LoadPromise", locks, target.constructor);
}

export function PreUnload(target: Provider, key: string) {
    Reflector.define("PreUnload", key, target.constructor);
}

export interface Provider {
    getDependency<T>(dep: Constructable<T>): T | undefined;
    load?(): void | Promise<void>;
    loadComponent(component: Component): Promise<void>;
    markReady(component: Constructable): void;
    reloadComponent(component: Constructable): Promise<void>;
    unload?(): void | Promise<void>;
    unloadComponent(component: Constructable): Promise<void>;
}
export function Provider<T extends Constructor<any>>(Base: T) {
    return class extends Base implements Provider {
        constructor(...args: any[]) {
            super(...args);

            if (!Reflector.get("Name", this.constructor))
                this.load();
        }

        async load() {
            logger.debug(`[${Reflector.get("Name", this.constructor) ?? Base.name}] Loading Provider`);
            const exports = Reflector.getCollection("Exports", Base);

            await exports.asyncMap(async key => await this.loadComponent(this[key]));
            await super.load?.();
        }

        markReady(constructor: Constructable) {
            const locks = Reflector.getCollection("LoadPromise", Base);
            const lock = locks.get(constructor);
            if (!lock)
                throw new Error("Missing load promise, is this marked with @NeedsLoad?");

            lock.resolve();
        }

        getDependency<U>(dep: Constructable<U>): U | undefined {
            const exports = Reflector.getCollection("Exports", Base);
            const parent = Reflector.get("Provider", this);

            const key = exports.get(dep);
            if (!key)
                return parent?.getDependency(dep);
            return this[key];
        }

        async loadComponent(component: Component) {
            Reflector.define("Provider", this, component);

            const constructor = component.constructor;

            const looseDeps = Reflector.getCollection("LooseDependencies", constructor);
            looseDeps.forEach((key, dep) => {
                const dependency = this.getDependency(dep);

                const depName: string = Reflector.get("Name", dep) ?? dep.name;

                if (!dependency)
                    throw new Error(`Missing dependency ${depName} ${key ? `for ${key} ` : ""}in ${Reflector.get("Name", constructor)!}`);

                logger.debug(`[${Reflector.get("Name", constructor)!}] Loading loose dependency ${depName}`);

                if (key)
                    (component as any)[key] = dependency;
            });

            const deps = Reflector.getCollection("Dependencies", constructor);
            await deps.asyncMap(async (key, dep) => {
                const dependency = this.getDependency(dep);

                const depName: string = Reflector.get("Name", dep) ?? dep.name;

                if (!dependency)
                    throw new Error(`Missing dependency ${depName} ${key ? `for ${key} ` : ""}in ${Reflector.get("Name", constructor)!}`);

                const depDepandants = Reflector.getCollection("Dependants", dependency);
                depDepandants.set(component.constructor, key);
                Reflector.setCollection("Dependants", depDepandants, dependency);

                const internalLocks = Reflector.getCollection("LoadPromise", Base);
                const depLock = Reflector.get("RequiresLoad", dep);

                const lock = internalLocks.get(dep) ?? depLock;
                if (depLock)
                    logger.debug(`[${Reflector.get("Name", constructor)!}] Waiting for ${depName}`);

                if (lock)
                    await lock.promise;

                (component as any)[key] = dependency;
            });

            if (component.load !== undefined) {
                const name: string = Reflector.get("Name", constructor) ?? constructor.name;
                const res = component.load?.();
                if (res instanceof Promise) {
                    const lock: Lock = Reflector.get("RequiresLoad", component.constructor)!;
                    if (!lock)
                        throw new Error(`Async load without @ComponentLoad in ${name}`);

                    logger.debug(`[${Reflector.get("Name", constructor)!}] Awaiting`);
                    await res;
                    lock.resolve();
                }
                logger.debug(`[${Reflector.get("Name", constructor)!}] Loaded`);
            }
        }

        async reloadComponent(constructor: Constructable<Component>) {
            const component = this.getDependency(constructor);
            if (!component)
                return;
            const depts = Reflector.getCollection("Dependants", component);
            await this.unloadComponent(constructor);
            await this.loadComponent(component);

            for (const [dept] of depts)
                await this.loadComponent(dept);
        }

        async unloadComponent(constructor: Constructable<Component>) {
            const component = this.getDependency(constructor);
            if (!component)
                return;

            const name: string = Reflector.get("Name", constructor) ?? constructor.name;

            logger.debug(`Preparing to unload ${name}`);

            const depts = Reflector.getCollection("Dependants", component);

            for (const [dep] of depts)
                await this.unloadComponent(dep);

            logger.debug(`Unloading ${name}`);
            await component.unload?.();

            const exports = Reflector.getCollection("Exports", Base);
            exports.delete(constructor);
            Reflector.setCollection("Exports", exports, Base);

            logger.debug(`Unloaded ${name}`);
        }

        async unload() {
            logger.debug(`[${Base.name}] Preparing to unload provider`);

            const preUnload = Reflector.get("PreUnload", Base);
            if (preUnload) {
                logger.debug(`[${Base.name}] Running pre-unload method ${preUnload}`);
                await super[preUnload]?.();
                logger.debug(`[${Base.name}] Unloading exports`);
            }

            for (const [constructor] of Reflector.getCollection("Exports", Base))
                await this.unloadComponent(constructor);

            logger.debug(`Unloading provider ${Base.name}`);
            await super.unload?.();

            logger.debug(`Unloaded provider ${Base.name}`);
        }
    };
}
