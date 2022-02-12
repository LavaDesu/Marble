import { TSMigrationGenerator } from "@mikro-orm/migrations";

export class CustomMigrationGenerator extends TSMigrationGenerator {
    /** @inheritDoc */
    generateMigrationFile(className: string, diff: {
        up: string[];
        down: string[];
    }): string {
        let file = super.generateMigrationFile(className, diff);
        file = file
            .replaceAll("  ", "    ")
            .replaceAll("'", '"');

        return file;
    };

}
