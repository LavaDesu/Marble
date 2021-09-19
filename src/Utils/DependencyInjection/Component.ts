import { Lock } from "ramune";
import type { Collection } from "../Collection";
import type { Provider } from "./Provider";
import { Constructable, ReflectionScope } from "../Reflection";

type MetadataMap = {
    DesignType: Constructable;
    DesignParamTypes: Constructable[];
    DesignReturnType: Constructable;
    Dependants: Collection<Constructable<Component>, string>;
    Dependencies: Collection<Constructable<Component>, string>;
    LazyDependencies: Collection<Constructable<Component>, string | undefined>;
    Name: string;
    Provider: Provider;
    RequiresLoad: Lock;
};
type MetadataTargetMap = {
    DesignType: Component;
    DesignParamTypes: Component;
    DesignReturnType: Component;
    Dependants: Component;
    Dependencies: Constructable<Component>;
    LazyDependencies: Constructable<Component>;
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
    LazyDependencies: Symbol("lazyDependencies"),
    Name: Symbol("name"),
    Provider: Symbol("provider"),
    RequiresLoad: Symbol("requiresLoad")
} as const;

const Reflector = new ReflectionScope<MetadataMap, MetadataTargetMap>(MetadataSymbols);
export { Reflector as ComponentReflector };

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

// Property Decorators

export function Dependency(target: Component, key: string) {
    const depConstructor = Reflector.get("DesignType", target, key)!;

    const deps = Reflector.getCollection("Dependencies", target.constructor);
    deps.set(depConstructor, key);
    Reflector.setCollection("Dependencies", deps, target.constructor);
}

export function LazyDependency(target: Component, key: string) {
    const depConstructor = Reflector.get("DesignType", target, key)!;

    const deps = Reflector.getCollection("LazyDependencies", target.constructor);
    deps.set(depConstructor, key);
    Reflector.setCollection("LazyDependencies", deps, target.constructor);
}


// Method Decorators

export function ComponentLoad(target: Component, key: string, _descriptor: PropertyDescriptor) {
    const retType = Reflector.get("DesignReturnType", target, key);
    if (retType !== Promise)
        return;

    const lock = new Lock();
    Reflector.define("RequiresLoad", lock, target.constructor);
}

