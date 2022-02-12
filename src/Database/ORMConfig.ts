import type { MikroORM } from "@mikro-orm/core";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";
import { CustomMigrationGenerator } from "./CustomMigrationGenerator";

const config: Parameters<(typeof MikroORM)["init"]>[0] = {
    migrations: {
        path: "out/Migrations",
        pathTs: "src/Migrations",
        generator: CustomMigrationGenerator
    },
    metadataProvider: TsMorphMetadataProvider,
    entities: ["./out/Database/Entities"],
    entitiesTs: ["./src/Database/Entities"],
    dbName: "Blob.db",
    type: "sqlite" as const,
    debug: process.env.NODE_ENV === "development",
    cache: { options: { cacheDir: "./ignore/db_cache" } }
};

/* eslint-disable-next-line import/no-default-export */
export default config;
