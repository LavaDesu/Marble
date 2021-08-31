import { Guild, Invite, Member } from "eris";
import { Blob } from "./Blob";
import { Store } from "./Store";
import { Collection } from "./Util/Collection";
import { asyncForEach } from "./Utils";

export class InviteTracker {
    /** format: Collection<GuildID, Collection<InviteCode, InviteUses>> */
    private readonly invites: Collection<string, Collection<string, number>>;

    constructor() {
        this.invites = new Collection();
    }

    public async init() {
        const settings = Store.Instance.getInviteTrackingSettings();
        const guildIDs = Object.keys(settings.guilds);

        let inviteCount = 0;
        await asyncForEach(guildIDs, async guildID => {
            const guild = Blob.Instance.guilds.get(guildID);
            if (!guild)
                return console.error("unknown guild id", guildID);

            const localInvites = this.invites.getOrSet(guildID, new Collection());
            const invites = await guild.getInvites();
            invites.forEach(invite => localInvites.set(invite.code, invite.uses));
            inviteCount += invites.length;
        });
        console.log(`Loaded ${inviteCount} invites from ${guildIDs.length} guilds`);

        Blob.Instance.on("guildMemberAdd", this.handleMemberAdd.bind(this));
        Blob.Instance.on("inviteCreate", this.handleInviteAdd.bind(this));
        Blob.Instance.on("inviteDelete", this.handleInviteDel.bind(this));
    }

    private async handleMemberAdd(guild: Guild, member: Member) {
        const settings = Store.Instance.getInviteTrackingSettings();

        if (!(guild.id in settings.guilds))
            return;

        const invites = this.invites.get(guild.id);
        if (!invites)
            return console.error("missing invites?", guild.id, member.id);

        const newInvites = await guild.getInvites();
        for (const invite of invites) {
            const currentInvite = newInvites.find(ni => ni.code === invite[0]);
            if (!currentInvite) {
                console.error("missing current invite?", guild.id, invite[0]);
                continue;
            }
            if (invite[1] !== currentInvite.uses) {
                const inviter = currentInvite.inviter;
                await Blob.Instance.createMessage(settings.guilds[guild.id], { embed: {
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
