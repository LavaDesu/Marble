import { Lock } from "ramune";

import { Collection } from "../Collection";
import { Logger } from "../Logger";
import { Constructable, Constructor, ReflectionScope } from "../Reflection";
import { Component, ComponentReflector } from "./Component";

type MetadataMap = {
    DesignType: Constructable;
    DesignParamTypes: Constructable[];
    DesignReturnType: Constructable;
    Exports: Collection<Constructable<Component>, string>;
    LoadPromise: Collection<Constructable<Component>, Lock>;
    PreUnload: string;
};
type MetadataTargetMap = {
    DesignType: Provider;
    DesignParamTypes: Provider;
    DesignReturnType: Provider;
    Exports: Constructable<Provider>;
    LoadPromise: Constructable<Provider>;
    PreUnload: Constructable<Provider>;
};
const MetadataSymbols = {
    DesignType: "design:type",
    DesignParamTypes: "design:paramtypes",
    DesignReturnType: "design:returntype",
    Exports: Symbol("exports"),
    LoadPromise: Symbol("loadPromise"),
    PreUnload: Symbol("preUnload")
};

const Reflector = new ReflectionScope<MetadataMap, MetadataTargetMap>(MetadataSymbols);

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
    const logger = new Logger(`DI/${Base.name}`);

    return class extends Base implements Provider {
        constructor(...args: any[]) {
            super(...args);

            if (!ComponentReflector.get("Name", this.constructor))
                this.load();
        }

        async load() {
            logger.debug(`[${ComponentReflector.get("Name", this.constructor) ?? Base.name}] Loading Provider`);
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
            const parent = ComponentReflector.get("Provider", this);

            const key = exports.get(dep);
            if (!key)
                return parent?.getDependency(dep);
            return this[key];
        }

        async loadComponent(component: Component) {
            ComponentReflector.define("Provider", this, component);

            const constructor = component.constructor;

            const looseDeps = ComponentReflector.getCollection("LazyDependencies", constructor);
            looseDeps.forEach((key, dep) => {
                const dependency = this.getDependency(dep);

                const depName: string = ComponentReflector.get("Name", dep) ?? dep.name;

                if (!dependency)
                    throw new Error(`Missing dependency ${depName} ${key ? `for ${key} ` : ""}in ${ComponentReflector.get("Name", constructor)!}`);

                logger.debug(`[${ComponentReflector.get("Name", constructor)!}] Loading loose dependency ${depName}`);

                if (key)
                    (component as any)[key] = dependency;
            });

            const deps = ComponentReflector.getCollection("Dependencies", constructor);
            await deps.asyncMap(async (key, dep) => {
                const dependency = this.getDependency(dep);

                const depName: string = ComponentReflector.get("Name", dep) ?? dep.name;

                if (!dependency)
                    throw new Error(`Missing dependency ${depName} ${key ? `for ${key} ` : ""}in ${ComponentReflector.get("Name", constructor)!}`);

                const depDepandants = ComponentReflector.getCollection("Dependants", dependency);
                depDepandants.set(component.constructor, key);
                ComponentReflector.setCollection("Dependants", depDepandants, dependency);

                const internalLocks = Reflector.getCollection("LoadPromise", Base);
                const depLock = ComponentReflector.get("RequiresLoad", dep);

                const lock = internalLocks.get(dep) ?? depLock;
                if (depLock)
                    logger.debug(`[${ComponentReflector.get("Name", constructor)!}] Waiting for ${depName}`);

                if (lock)
                    await lock.promise;

                (component as any)[key] = dependency;
            });

            if (component.load !== undefined) {
                const name: string = ComponentReflector.get("Name", constructor) ?? constructor.name;
                const res = component.load?.();
                if (res instanceof Promise) {
                    const lock: Lock = ComponentReflector.get("RequiresLoad", component.constructor)!;
                    if (!lock)
                        throw new Error(`Async load without @ComponentLoad in ${name}`);

                    logger.debug(`[${ComponentReflector.get("Name", constructor)!}] Awaiting`);
                    await res;
                    lock.resolve();
                }
                logger.debug(`[${ComponentReflector.get("Name", constructor)!}] Loaded`);
            }
        }

        async reloadComponent(constructor: Constructable<Component>) {
            const component = this.getDependency(constructor);
            if (!component)
                return;
            const depts = ComponentReflector.getCollection("Dependants", component);
            await this.unloadComponent(constructor);
            await this.loadComponent(component);

            for (const [dept] of depts)
                await this.loadComponent(dept);
        }

        async unloadComponent(constructor: Constructable<Component>) {
            const component = this.getDependency(constructor);
            if (!component)
                return;

            const name: string = ComponentReflector.get("Name", constructor) ?? constructor.name;

            logger.debug(`Preparing to unload ${name}`);

            const depts = ComponentReflector.getCollection("Dependants", component);

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

// Property decorators

export function Export(target: Provider, key: string) {
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
