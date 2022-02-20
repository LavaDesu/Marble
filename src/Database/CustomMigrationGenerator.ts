import { TSMigrationGenerator } from "@mikro-orm/migrations";

export class CustomMigrationGenerator extends TSMigrationGenerator {
    /** @inheritDoc */
    generateMigrationFile(className: string, diff: {
        up: string[];
        down: string[];
    }): string {
        return "/* eslint-disable */\n" + super.generateMigrationFile(className, diff);
    };

}
