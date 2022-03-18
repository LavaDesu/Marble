import { Component, Load, Use } from "../Utils/DependencyInjection";
import { DiscordClient } from "./Discord";
import { Message } from "eris";
import { Collection } from "../Utils/Collection";

@Component("CommandRegistry")
export class CommandRegistry {
    protected static readonly commands: Collection<string, [any, string, string?]> = new Collection();

    static register(command: Component, prefixToMethodMap: [string, string][]) {
        prefixToMethodMap.forEach(([prefix, methodName]) => {
            this.commands.set(prefix, [command, methodName]);
        });
    }
    static unregister(command: Component) {
        for (const [key, [component]] of this.commands)
            if (component === command)
                this.commands.delete(key);
    }

    @Load
    async load(@Use() discord: DiscordClient) {
        discord.on("messageCreate", this.handleMessage.bind(this));
    }

    protected async handleMessage(msg: Message) {
        for (const [prefix, [component, key, group]] of (this.constructor as typeof CommandRegistry).commands)
            if (msg.content.startsWith(prefix)) {
                const shouldAllow: boolean = group ? await component[group](msg) : msg;
                if (!shouldAllow)
                    return;
                /* eslint-disable-next-line @typescript-eslint/return-await */
                return await component[key](msg);
            }
    }
}
