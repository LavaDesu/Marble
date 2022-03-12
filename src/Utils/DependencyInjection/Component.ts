import { Lock } from "ramune";
import type { Collection } from "../Collection";
import type { Container } from "./Container";
import { Constructor, ReflectionScope } from "../Reflection";

type MetadataMap = {
    DesignType: unknown;
    DesignParamTypes: unknown[];
    DesignReturnType: unknown;

    Dependants: Collection<Constructor, string>;
    Dependencies: Collection<Constructor, string>;
    LazyDependencies: Collection<Constructor, string>;

    Name: string;
    IsAsync: boolean | undefined;
    LoadFunction: string | undefined;
    UnloadFunction: string | undefined;

    Container: Container;
    LoadPromise: Lock;
};
type MetadataTargetMap = {
    DesignType: Component;
    DesignParamTypes: Component;
    DesignReturnType: Component;

    Dependants: Component;
    Dependencies: Constructor;
    LazyDependencies: Constructor;

    Name: Constructor;
    IsAsync: Constructor;
    LoadFunction: Constructor;
    UnloadFunction: Constructor;

    Container: Component;
    LoadPromise: Component;
};
const MetadataSymbols = {
    DesignType: "design:type",
    DesignParamTypes: "design:paramtypes",
    DesignReturnType: "design:returntype",

    Dependants: Symbol("dependants"),
    Dependencies: Symbol("dependencies"),
    LazyDependencies: Symbol("lazyDependencies"),

    Name: Symbol("name"),
    IsAsync: Symbol("isAsync"),
    LoadFunction: Symbol("loadFunction"),
    UnloadFunction: Symbol("unloadFunction"),

    Container: Symbol("container"),
    LoadPromise: Symbol("loadPromise")
} as const;

const Reflector = new ReflectionScope<MetadataMap, MetadataTargetMap>(MetadataSymbols);
export { Reflector as ComponentReflector };

export interface Component {
    // The only reason we need this is because of https://github.com/microsoft/TypeScript/issues/3841
    constructor: any;
}
export function Component(name?: string) {
    return function<T extends Constructor>(Base: T) {
        Reflector.define("Name", name ?? Base.name, Base);
    };
}

// Property Decorators

export function Dependency(target: Component, key: string) {
    const cls = target.constructor;
    const depCls = Reflector.get("DesignType", target, key)! as Constructor;

    const deps = Reflector.getCollection("Dependencies", cls);
    deps.set(depCls, key);
    Reflector.setCollection("Dependencies", deps, cls);
}

export function LazyDependency(target: Component, key: string) {
    const cls = target.constructor;
    const depCls = Reflector.get("DesignType", target, key)! as Constructor;

    const deps = Reflector.getCollection("LazyDependencies", cls);
    deps.set(depCls, key);
    Reflector.setCollection("LazyDependencies", deps, cls);
}


// Method Decorators

export function Load(target: Component, key: string, _descriptor: PropertyDescriptor) {
    const cls = target.constructor;
    const retType = Reflector.get("DesignReturnType", target, key);
    if (retType === Promise)
        Reflector.define("IsAsync", true, cls);

    Reflector.define("LoadFunction", key, cls);
}

export function Unload(target: Component, key: string, _descriptor: PropertyDescriptor) {
    const cls = target.constructor;

    Reflector.define("IsAsync", false, cls);
    Reflector.define("UnloadFunction", key, cls);
}

