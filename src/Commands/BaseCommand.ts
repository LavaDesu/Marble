import { ApplicationCommandOption, CommandContext, CommandOptionType, SlashCommand, SlashCommandOptions } from "slash-create";
import { SlashHandler } from "../Components/SlashHandler";
import { Collection } from "../Utils/Collection";
import { ComponentLoad } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";
import { Constructable, ReflectionScope } from "../Utils/Reflection";

export type LightOptions = Omit<SlashCommandOptions, "name" | "description">;

type MetadataMap = {
    CommandExec: string;
    Subcommands: Collection<string, {
        description?: string;
        disabled: boolean;
        isGroup: boolean;
        method: string;
        options?: ApplicationCommandOption[];
    }>;
};
type MetadataTargetMap = {
    CommandExec: Constructable<BaseCommand>;
    Subcommands: Constructable<BaseCommand>;
};
const MetadataSymbols = {
    CommandExec: Symbol("commandExec"),
    Subcommands: Symbol("subcommand")
} as const;

const Reflector = new ReflectionScope<MetadataMap, MetadataTargetMap>(MetadataSymbols);
export { Reflector as CommandReflector };

export abstract class BaseCommand {
    protected readonly logger: Logger = new Logger("Command/Unknown");
    protected abstract name: string;
    protected abstract description: string;

    protected readonly slashInstance!: SlashHandler;

    public command!: SlashCommand;

    protected setupOptions?(): LightOptions | Promise<LightOptions>;

    constructor(creator: SlashHandler) {
        this.slashInstance = creator;
    }

    @ComponentLoad
    async load() {
        await this.buildCommand();
    }

    async unload() {
        const self = this;
        this.slashInstance.unregisterCommand(this.command);
        this.command = new class extends SlashCommand {
            constructor() {
                super(self.slashInstance, {
                    name: self.name,
                    description: "you shouldn't be seeing this!",
                    defaultPermission: false
                });
            }
        }();
        this.slashInstance.registerCommand(this.command);
        await this.slashInstance.requestSync();
    }

    protected async buildCommand() {
        const subcommands = Reflector.getCollection("Subcommands", this.constructor);
        const options = (await this.setupOptions?.()) ?? {};
        const subcmdsAsOptions = subcommands
            .entriesArray()
            .filter(subcmd => !subcmd[1].disabled)
            .map(([name, { description, isGroup, options: scOptions }]) => ({
                type: isGroup ? CommandOptionType.SUB_COMMAND_GROUP : CommandOptionType.SUB_COMMAND,
                name,
                description: description ?? this.description,
                options: scOptions
            }));

        const self = this;
        this.command = new class extends SlashCommand {
            constructor() {
                super(self.slashInstance, {
                    ...options,
                    name: self.name,
                    description: self.description,
                    options: [
                        ...subcmdsAsOptions,
                        ...options.options ?? []
                    ]
                });

                this.run = self.onCommand.bind(self);
            }
        }();
        this.slashInstance.registerCommand(this.command);
        await this.slashInstance.requestSync();
    }

    protected async disableSubcommand(subcmdName: string) {
        const subcommands = Reflector.getCollection("Subcommands", this.constructor);
        const subcmd = subcommands.get(subcmdName);
        if (!subcmd)
            return this.logger.warn(`Subcommand ${subcmdName} not found!`);
        subcmd.disabled = true;

        await this.buildCommand();
    }

    protected async enableSubcommand(subcmdName: string) {
        const subcommands = Reflector.getCollection("Subcommands", this.constructor);
        const subcmd = subcommands.get(subcmdName);
        if (!subcmd)
            return this.logger.warn(`Subcommand ${subcmdName} not found!`);
        subcmd.disabled = false;

        await this.buildCommand();
    }

    protected async onCommand(ctx: CommandContext) {
        const subcommands = Reflector.getCollection("Subcommands", this.constructor);

        for (const [name, { method }] of subcommands)
            if (name in ctx.options) {
                await (this as any)[method](ctx);
                return;
            }

        const commandExec = Reflector.get("CommandExec", this.constructor);
        if (commandExec)
            await (this as any)[commandExec](ctx);
        else
            await ctx.send("invalid command..?\nthis isn't supposed to happen, please contact lava");
    };
}

export function CommandExec(target: BaseCommand, key: string, _descriptor: PropertyDescriptor) {
    if (!(target instanceof BaseCommand))
        throw new Error("@CommandExec used on a target that doesn't extend Command!");

    Reflector.define("CommandExec", key, target.constructor);
}

export function Subcommand(name: string, description: string, options?: ApplicationCommandOption[], isGroup?: boolean) {
    return function(target: BaseCommand, key: string, _descriptor: PropertyDescriptor) {
        if (!(target instanceof BaseCommand))
            throw new Error("@Subcommand used on a target that doesn't extend Command!");
        const subcommands = Reflector.getCollection("Subcommands", target.constructor);
        subcommands.set(name, {
            description,
            disabled: false,
            isGroup: isGroup ?? false,
            method: key,
            options
        });
        Reflector.setCollection("Subcommands", subcommands, target.constructor);
    };
}
