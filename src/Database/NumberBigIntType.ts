import { BigIntType } from "@mikro-orm/core";

export interface NumberBigIntType {
    convertToJSValue(value: string | null | undefined): number | null;
}
export class NumberBigIntType extends BigIntType {
    convertToJSValue(value: any): any {
        if (value === null || value === undefined)
            return null;

        return parseInt(value);
    }
}
