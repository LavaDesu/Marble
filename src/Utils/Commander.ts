import type { Message } from "eris";
import { Collection } from "./Collection";
import { CommandRegistry } from "../Components/CommandRegistry";
import { Component, ComponentReflector, Inject } from "./DependencyInjection";
import { Constructor, ReflectionScope } from "./Reflection";

type MetadataMap = {
    Groups: Collection<string, { prefix: string; processor: string }>;
    CommandNames: Collection<string, CommandInfo>;
};
type MetadataTargetMap = {
    Groups: Constructor;
    CommandNames: Constructor;
};
const MetadataSymbols = {
    Groups: Symbol("groups"),
    CommandNames: Symbol("commandNames")
} as const;

const Reflector = new ReflectionScope<MetadataMap, MetadataTargetMap>(MetadataSymbols);
export { Reflector as CommandReflector };

export interface CommandOptions {
    name?: string;
    group?: string;
    prefix?: string;
    description?: string;
}

export interface CommandInfo {
    name: string;
    key: string;
    group?: string;
    prefix?: string;
    description?: string;
}

// Class Decorators

export function CommandComponent(name?: string) {
    return function<T extends Constructor>(Base: T) {
        // NOTE: If component eventually does mixins, this will break;
        Component(name)(Base);

        return class extends Base {
            constructor(...args: any[]) {
                super(...args);

                const groups = Reflector.getCollection("Groups", Base);
                const names = Reflector.getCollection("CommandNames", Base);
                CommandRegistry.register(this, names.map(cmd => [
                    ((cmd.group && groups.get(cmd.group)?.prefix) ?? "") + (cmd.prefix ?? "") + cmd.name,
                    cmd.key
                ]));
            }
        };
    };
}

// Method Decorators

type GroupDefinitionDescriptor = TypedPropertyDescriptor<(...args: any[]) => Promise<boolean>>;
export function GroupDefinition(name: string, prefix?: string) {
    return function (target: Component, key: string, descriptor: GroupDefinitionDescriptor) {
        Inject(target, key, descriptor);

        const cls = target.constructor;
        const groups = Reflector.getCollection("Groups", cls);
        groups.set(name, {
            prefix: prefix ?? "",
            processor: key
        });
        Reflector.setCollection("Groups", groups, cls);
    };
}

export function Command(options?: CommandOptions) {
    return function (target: Component, key: string, descriptor: PropertyDescriptor) {
        Inject(target, key, descriptor);

        const retType = ComponentReflector.get("DesignReturnType", target, key);
        if (retType !== Promise)
            throw new Error("Command methods must be async");

        const cls = target.constructor;
        const names = Reflector.getCollection("CommandNames", cls);
        const name = options?.name ?? key;
        const opt = {
            name,
            key,
            group: options?.group,
            prefix: options?.prefix ?? "",
            description: options?.description
        };
        names.set(key, opt);
        Reflector.setCollection("CommandNames", names, cls);

        const aParams = ComponentReflector.get("DesignParamTypes", target, key);
        const params = [...aParams];
        params.shift();
        const injections = ComponentReflector.get("Injections", cls)?.get(key);
        const injCutoff = injections?.[0][0];

        const method = descriptor.value!;
        descriptor.value = async function (msg: Message, ...args: unknown[]) {
            if (!msg.content.startsWith(opt.prefix))
                return console.error("Command with invalid prefix attempted to be run");

            let groupPrefix = 0;
            if (opt.group) {
                const groups = Reflector.getCollection("Groups", cls);
                const group = groups.get(opt.group);
                groupPrefix = group?.prefix.length ?? 0;
            }

            let content = msg.content.slice(groupPrefix + opt.prefix.length + name.length + 1);
            for (let i = 0; i < params.slice(0, injCutoff).length; i++) {
                const type = params[i];
                switch (type) {
                    case String: {
                        if (content.startsWith('"')) {
                            const end = content.indexOf('"', 1);
                            if (end < 1)
                                return await msg.channel.createMessage("Invalid string in argument " + i);
                            args[i] = content.slice(1, end);
                            content = content.slice(end + 2);
                        } else {
                            const str = content.split(" ")[0];
                            content = content.slice(str.length + 1);

                            if (str.length !== 0)
                                args[i] = str;
                        }
                        break;
                    }
                    case Number: {
                        const str = content.split(" ")[0];

                        const num = Number(str);
                        if (isNaN(num))
                            return await msg.channel.createMessage("Invalid number in argument " + i);

                        console.log(content);
                        if (str.length !== 0)
                            args[i] = num;

                        content = content.slice(str.length + 1);
                        break;
                    }
                    default: {
                        break;
                    }
                }
            };
            method.apply(this, [msg, ...args]);
        };
    };
}
