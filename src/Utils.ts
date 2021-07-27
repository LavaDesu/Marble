export async function asyncMap<T>(array: T[], cb: (value: T, index: number, arr: T[]) => Promise<T>): Promise<T[]> {
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
