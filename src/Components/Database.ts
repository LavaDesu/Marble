import { Component, ComponentLoad } from "../Utils/DependencyInjection";
import { MikroORM } from "@mikro-orm/core";
import ORMConfig from "../Database/ORMConfig";

@Component("Database")
export class Database {
    private orm!: MikroORM;

    @ComponentLoad
    public async load(): Promise<void> {
        this.orm = await MikroORM.init(ORMConfig);
    }

    public getManager() {
        return this.orm.em.fork();
    }
}
