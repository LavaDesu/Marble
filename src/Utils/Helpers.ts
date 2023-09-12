export async function asyncMap<T, R>(array: T[], cb: (value: T, index: number, arr: T[]) => Promise<R>): Promise<R[]> {
    return await Promise.all(array.map(cb));
}
export async function asyncForEach<T>(array: T[], cb: (value: T, index: number, arr: T[]) => Promise<any>): Promise<void> {
    await asyncMap(array, cb);
    return;
}
export function sanitiseDiscord(message: string) {
    // TODO: can do some regex black magic here
    return message
        .replaceAll("_", "\\_")
        .replaceAll("-", "\\-")
        .replaceAll("*", "\\*")
        .replaceAll(".", "\\.");
}
export function capitalise(str: string) {
    return str[0].toUpperCase() + str.slice(1);
}
