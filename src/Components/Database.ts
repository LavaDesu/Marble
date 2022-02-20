import { Component, ComponentLoad } from "../Utils/DependencyInjection";
import { MikroORM } from "@mikro-orm/core";
import type { PostgreSqlDriver } from "@mikro-orm/postgresql";
import ORMConfig from "../Database/ORMConfig";
import { Logger } from "../Utils/Logger";

@Component("Database")
export class Database {
    private readonly logger = new Logger("Database");

    private orm!: MikroORM<PostgreSqlDriver>;

    @ComponentLoad
    public async load(): Promise<void> {
        this.orm = await MikroORM.init<PostgreSqlDriver>(ORMConfig);
        const migrator = this.orm.getMigrator();
        await migrator.up();
    }

    public getManager() {
        return this.orm.em.fork();
    }
}
