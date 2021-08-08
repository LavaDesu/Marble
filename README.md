# Marble

A Discord bot for a league event, where players have to play a mappool and their scores
will be tallied up as points to decide the winner at the end of each month.

The current points system is that:
  - First place in a map gets 3 points
  - Second place in a map gets 2 points
  - Third place in a map gets 1 point

## Setup

### Environment

Copy [.envrc.example](./.envrc.example) to .envrc, this file holds a few environment
variables needed for the bot to function.

Source this everytime you want to run the bot

| Variable | Description |
| -------- | ----------- |
| NODE_ENV | Set to `"development"` to enable some debugging functions |
| MARBLE_DEV | The bot owner's Discord user ID |
| MARBLE_DEV_GUILD | The guild ID where the bot owner can use dev commands from |
| MARBLE_BOT | The bot's application/user ID |
| MARBLE_KEY | The bot's public key |
| MARBLE_TOKEN | The bot's token |
| MARBLE_ID | The osu! OAuth app ID |
| MARBLE_SECRET | The osu! OAuth app secret |
| MARBLE_WEBHOOK_ID | The channel ID to use as a scorefeed where new scores are posted |
| MARBLE_WEBHOOK_SECRET | The webhook token for a webhook in the aforementioned channel |

### data.json

This is the JSON structure:
```ts
interface Data {
    /**
     * List of guilds where you could use the commands in
     */
    commandGuilds: string[];
    /**
     * List of rank emotes to use
     */
    rankEmotes: { [name in ScoreRank]: string };
    /**
     * Main guild where all the players should be in
     */
    targetGuild: string;
    /**
     * League information
     */
    leagues: Record<string, League>;
}

interface League {
    /**
     * Array of tuples of [discordID, osuID]
     */
    players: [string, string][];
    /**
     * 2-dimensional array of a tuple
     * First depth describes the weeks
     * Second depth describes the mappool itself, which is
     * an array of tuples of [mapID, mods[]]
     */
    maps: [string, Mod[]?][][];
}
```

## Starting

[pnpm](https://pnpm.io) is used as the package manager.

First, install dependencies

```sh
pnpm i
```

You can then either build it and run the compiled JS, or run the TypeScript files
directly with ts-node-dev.

### Building and running compiled JS
```sh
pnpm run build
node out/Marble.js
```

### Running with ts-node-dev
```sh
pnpm run start
```
