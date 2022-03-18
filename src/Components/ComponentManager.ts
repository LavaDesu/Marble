import { ActionRowComponents, ComponentInteraction } from "eris";
import { Collection } from "../Utils/Collection";
import { Component, LazyDependency, Load } from "../Utils/DependencyInjection";
import { Utils } from "../Utils";
import { Logger } from "../Utils/Logger";
import { DiscordClient } from "./Discord";

type ComponentsWithID<T extends ActionRowComponents = ActionRowComponents> = T extends { custom_id: string } ? Omit<T, "custom_id"> : never;
type ComponentCallback = (int: ComponentInteraction) => any;

@Component()
export class ComponentManager {
    protected readonly logger = new Logger("ComponentManager");
    protected readonly activeComponents = new Collection<string, ComponentCallback>();

    @LazyDependency protected readonly discord!: DiscordClient;
    @Load
    public async load() {
        this.discord.on("interactionCreate", int => {
            // Yikes, best we could do for now
            const id = (int as any).data?.custom_id as string | undefined;
            this.logger.debug(id);
            if (!id)
                return;

            const callback = this.activeComponents.get(id);
            if (callback) {
                callback(int as ComponentInteraction);
                this.activeComponents.delete(id);
            }
        });
    }

    public register<T extends ComponentsWithID>(callback: ComponentCallback, component: T): T & { custom_id: string } {
        const id = Utils.genID();
        this.activeComponents.set(id, callback);
        return { ...component, custom_id: id };
    }
}
