import { randomUUID } from "crypto";
import { ActionRow, ActionRowComponents, Constants as ErisConstants } from "eris";

export async function asyncMap<T, R>(array: T[], cb: (value: T, index: number, arr: T[]) => Promise<R>): Promise<R[]> {
    return await Promise.all(array.map(cb));
}
export async function asyncForEach<T>(array: T[], cb: (value: T, index: number, arr: T[]) => Promise<any>): Promise<void> {
    await asyncMap(array, cb);
    return;
}
export function sanitiseDiscord(message: string) {
    // TODO: can do some regex black magic here
    // only sanitises _ since that's the only discord markdown character that's also
    // allowed in osu usernames
    return message
        .replaceAll("_", "\\_");
}

export function wrapComponents(components: ActionRowComponents | (ActionRowComponents)[]): ActionRow[] {
    const select: ActionRow[] = [];
    const button: ActionRow[] = [];

    const input = Array.isArray(components) ? components : [components];
    input.forEach(comp => {
        if (comp.type === ErisConstants.ComponentTypes.SELECT_MENU)
            select.push({
                type: ErisConstants.ComponentTypes.ACTION_ROW,
                components: [comp]
            });
        else if (comp.type === ErisConstants.ComponentTypes.BUTTON) {
            const last = button[button.length - 1];
            if (last?.components.length < 5)
                last.components.push(comp);
            else
                button.push({
                    type: ErisConstants.ComponentTypes.ACTION_ROW,
                    components: [comp]
                });
        }
    });

    const merged = [...select, ...button];
    if (merged.length > 5)
        throw new Error("Component limit exceeded");

    return merged;
}

const uuidConstant = randomUUID({ disableEntropyCache: true });
let idCounter = 0;
export function genID() {
    return `blob${uuidConstant}${Date.now()}${idCounter++}`;
}
