import type { Configuration, IDatabaseDriver, Options } from "@mikro-orm/core";
import type { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";
import { Config } from "../Config";
import { CustomMigrationGenerator } from "./CustomMigrationGenerator";

type ORMConfig<D extends IDatabaseDriver = IDatabaseDriver> = Options<D> | Configuration<D>;
const config: ORMConfig<PostgreSqlDriver> = {
    dbName: Config.dbName,
    host: Config.dbHost,
    user: Config.dbUser,
    password: Config.dbPassword,

    migrations: {
        path: "out/Migrations",
        pathTs: "src/Migrations",
        generator: CustomMigrationGenerator,
        disableForeignKeys: false
    },
    schemaGenerator: {
        disableForeignKeys: false
    },
    metadataProvider: TsMorphMetadataProvider,
    entities: ["./out/Database/Entities"],
    entitiesTs: ["./src/Database/Entities"],
    type: "postgresql" as const,
    debug: process.env.NODE_ENV === "development",
    cache: { options: { cacheDir: Config.dbCache } }
};

/* eslint-disable-next-line import/no-default-export */
export default config;
