import { Guild, Invite, Member } from "eris";
import { DiscordClient } from "../Discord";
import { Component, ComponentLoad, Dependency } from "../DependencyInjection";
import { Store } from "./Store";
import { Collection } from "../Util/Collection";
import { asyncForEach } from "../Utils";
import { Logger } from "../Logger";

@Component("Tracker/Invite")
export class InviteTracker implements Component {
    private readonly logger = new Logger("Tracker/Invite");

    @Dependency
    private readonly discord!: DiscordClient;

    @Dependency
    private readonly store!: Store;

    /** format: Collection<GuildID, Collection<InviteCode, InviteUses>> */
    private readonly invites: Collection<string, Collection<string, number>>;

    constructor() {
        this.invites = new Collection();
    }

    @ComponentLoad
    public async load() {
        const settings = this.store.getInviteTrackingSettings();
        const guildIDs = Object.keys(settings.guilds);

        let inviteCount = 0;
        await asyncForEach(guildIDs, async guildID => {
            const guild = this.discord.guilds.get(guildID);
            if (!guild)
                return this.logger.error("unknown guild id", guildID);

            const localInvites = this.invites.getOrSet(guildID, new Collection());
            const invites = await guild.getInvites();
            invites.forEach(invite => localInvites.set(invite.code, invite.uses));
            inviteCount += invites.length;
        });
        this.logger.info(`Loaded ${inviteCount} invites from ${guildIDs.length} guilds`);

        this.discord.on("guildMemberAdd", this.handleMemberAdd.bind(this));
        this.discord.on("inviteCreate", this.handleInviteAdd.bind(this));
        this.discord.on("inviteDelete", this.handleInviteDel.bind(this));
    }

    private async handleMemberAdd(guild: Guild, member: Member) {
        const settings = this.store.getInviteTrackingSettings();

        if (!(guild.id in settings.guilds))
            return;

        const invites = this.invites.get(guild.id);
        if (!invites)
            return this.logger.error("missing invites?", guild.id, member.id);

        const newInvites = await guild.getInvites();
        for (const invite of invites) {
            const currentInvite = newInvites.find(ni => ni.code === invite[0]);
            if (!currentInvite) {
                this.logger.error("missing current invite?", guild.id, invite[0]);
                continue;
            }
            if (invite[1] !== currentInvite.uses) {
                const inviter = currentInvite.inviter;
                await this.discord.createMessage(settings.guilds[guild.id], { embed: {
                    title: "beep boop new member!",
                    thumbnail: { url: member.avatarURL },
                    fields: [
                        {
                            name: "User",
                            inline: true,
                            value: `${member.username}#${member.discriminator} (${member.id})`
                        },
                        {
                            name: "Inviter",
                            inline: true,
                            value: inviter
                                ? `${inviter.username}#${inviter.discriminator} (${inviter.id})`
                                : "Unknown"
                        },
                        {
                            name: "Invite",
                            inline: true,
                            value: currentInvite.code
                        }
                    ]
                } });
            }
        }
    }

    private handleInviteAdd(guild: Guild, invite: Invite) {
        this.invites.get(guild.id)?.set(invite.code, invite.uses);
    }

    private handleInviteDel(guild: Guild, invite: Invite) {
        this.invites.get(guild.id)?.delete(invite.code);
    }
}
