import { Lock } from "ramune";

import { Collection } from "../Collection";
import { Logger } from "../Logger";
import { Constructor } from "../Reflection";
import { type Component, ComponentReflector } from "./Component";

const globalScope = Symbol("Global");
export class Container {
    private static readonly containers: Collection<symbol, Container> = new Collection();
    static scope(scope: symbol = globalScope, config: { strict: boolean } = { strict: false }) {
        return this.containers.getOrLazySet(scope, () => new Container(scope, config));
    }

    protected readonly logger: Logger;
    protected readonly scope: symbol;
    protected readonly config: { strict: boolean };

    protected readonly components: Collection<Constructor<Component>, Component> = new Collection();

    constructor(scope: symbol, config: { strict: boolean }) {
        this.logger = new Logger(scope.description);
        this.scope = scope;
        this.config = config;
    }

    public async get<T extends Component>(cls: Constructor<T>) {
        let inst = this.components.get<T>(cls);
        if (!inst)
            try {
                inst = await this.load(cls);
            } catch(_e: unknown) {
                const e = _e as Error;
                e.message += "\n  While loading " + cls.name;
                throw e;
            }

        const lock = ComponentReflector.get("LoadPromise", inst);
        if (lock)
            await lock.promise;

        return this.components.getOrSet(cls, inst) as T;
    }

    public getNoWait<T extends Component>(cls: Constructor<T>) {
        return this.components.getOrLazySet(cls, () => {
            let inst: T;
            try {
                inst = this.preInit(cls);
                this.load(cls, inst);
            } catch(_e: unknown) {
                const e = _e as Error;
                e.message += "\n  While loading " + cls.name;
                throw e;
            }
            return inst;
        }) as T;
    }

    protected preInit<T extends Component>(cls: Constructor<T>): T {
        const inst = new cls();

        if (!ComponentReflector.get("Name", cls))
            if (this.config.strict)
                throw new Error(`Attempted to load a component ${cls.name} without decorator in strict checks`);
            else
                ComponentReflector.define("Name", cls.name, cls);

        ComponentReflector.define("Container", this, inst);
        if (ComponentReflector.get("IsAsync", cls))
            ComponentReflector.define("LoadPromise", new Lock(), inst);

        return inst;
    }

    public async unload(cls: Constructor) {
        const inst = this.components.get(cls);
        if (!inst)
            return;

        const name: string = ComponentReflector.get("Name", cls);
        const depts = ComponentReflector.getCollection("Dependants", cls);
        const unloadName = ComponentReflector.get("UnloadFunction", cls);

        this.logger.debug(`Preparing to unload ${name}`);
        for (const [dep] of depts)
            await this.unload(dep);

        this.logger.debug(`Unloading ${name}`);
        if (unloadName)
            await (inst as any)[unloadName]();
        this.components.delete(cls);
        this.logger.debug(`Unloaded ${name}`);
    }

    protected async load<T extends Component>(cls: Constructor<T>, iinst?: T) {
        const name = ComponentReflector.get("Name", cls)!;
        let inst: T;
        try {
            inst = iinst ?? this.preInit(cls);
        } catch(_e: unknown) {
            const e = _e as Error;
            e.message += "\n  While loading " + name;
            throw e;
        }

        const looseDeps = ComponentReflector.getCollection("LazyDependencies", cls);
        const deps = ComponentReflector.getCollection("Dependencies", cls);

        this.logger.debug(`[${name}]: ${deps.size}/${looseDeps.size} dependencies`);

        // Stage 1: Load lazy dependencies
        looseDeps.forEach((key, depCls) => {
            let depInst;
            try {
                depInst = this.getNoWait(depCls);
            } catch(_e: unknown) {
                const e = _e as Error;
                e.message += "\n  While loading " + name;
                throw e;
            }

            const depName = ComponentReflector.get("Name", depCls);
            this.logger.debug(`[${name}] Loading loose dependency ${depName}`);
            if (key === null)
                return this.logger.debug(`[${name}] Dependency ${depName} is an injection`);

            const depDepandants = ComponentReflector.getCollection("Dependants", depInst);
            depDepandants.set(cls, key);
            ComponentReflector.setCollection("Dependants", depDepandants, depInst);

            (inst as any)[key] = depInst;
        });

        // Stage 2: Load dependencies
        await deps.asyncMap(async (key, depCls) => {
            let depInst;
            try {
                depInst = this.getNoWait(depCls);
            } catch(_e: unknown) {
                const e = _e as Error;
                e.message += "\n  While loading " + name;
                throw e;
            }

            const depName = ComponentReflector.get("Name", depCls);
            this.logger.debug(`[${name}] Waiting for dependency ${depName}`);

            const lock = ComponentReflector.get("LoadPromise", depInst);
            if (lock)
                await lock.promise;

            const depDepandants = ComponentReflector.getCollection("Dependants", depInst);
            depDepandants.set(cls, key);
            ComponentReflector.setCollection("Dependants", depDepandants, depInst);

            (inst as any)[key] = depInst;
        });


        // Stage 3: Run component's load routine
        const loadName = ComponentReflector.get("LoadFunction", cls);
        if (loadName) {
            const lock = ComponentReflector.get("LoadPromise", inst);
            const res = (inst as any)[loadName]();
            if (lock) {
                this.logger.debug(`[${name}] Awaiting`);
                await res;
                lock.resolve();
            }
            this.logger.debug(`[${name}] Loaded`);
        }

        return inst;
    }
}
