import { BaseEntity, Entity, Filter, Index, Property } from "@mikro-orm/core";

@Entity({ abstract: true })
@Filter({ name: "notDeleted", cond: { deleted: undefined }, default: true })
export abstract class CustomBaseEntity<T, PK extends keyof T, P extends string = never> extends BaseEntity<T, PK, P> {
    @Property({ columnType: "timestamptz(3)" }) @Index() deleted?: Date;
}
