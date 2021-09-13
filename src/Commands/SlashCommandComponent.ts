import { CommandContext, SlashCommand, SlashCommandOptions, SlashCreator } from "slash-create";
import { Dependency } from "../DependencyInjection";

export abstract class SlashCommandComponent {
    @Dependency
    protected readonly slashInstance!: SlashCreator;

    public command!: SlashCommand;

    public create(opts: SlashCommandOptions) {
        const self = this;

        this.command = new class extends SlashCommand {
            constructor() {
                super(self.slashInstance, opts);

                this.run = self.run.bind(self);
            }
        }();
        this.slashInstance.registerCommand(this.command);
    }

    unload() {
        this.slashInstance.unregisterCommand(this.command);
        this.slashInstance.syncCommands();
    }

    protected abstract run(ctx: CommandContext): Promise<any>;
}
