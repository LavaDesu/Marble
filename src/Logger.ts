import { Blob } from "./Blob";
import { ReflectUtils } from "./DependencyInjection";

export function UseLogger(name?: string) {
    return function(target: any, _key: string, descriptor: PropertyDescriptor) {
        const componentName = ReflectUtils.get("Name", Object.getPrototypeOf(target));
        const instance = new Logger(name ?? componentName);

        descriptor.get = () => instance;
    };
}

export class Logger {
    private readonly name?: string;

    constructor(name?: string) {
        this.name = name;
    }

    private format(severity: string, data: unknown[]) {
        let msg = data[0];
        let args = data;

        const time = new Date().toLocaleTimeString("en-GB");
        const namePrefix = this.name ? `:${this.name}` : "";
        const prefix = `\x1b[90m[${time}]\x1b[0m ${severity === "D" ? "\x1b[90m" : ""}[${severity.toUpperCase()}${namePrefix}]`;

        if (typeof msg === "string") {
            msg = prefix + " " + msg;
            args = data.slice(1);
        } else
            msg = prefix;

        return [msg, ...args];
    }

    info(...data: unknown[]) {
        const msg = this.format("I", data);
        console.log(...msg);
    }

    warn(...data: unknown[]) {
        const msg = this.format("W", data);
        console.warn(...msg);
    }

    error(...data: unknown[]) {
        const msg = this.format("E", data);
        console.error(...msg);
    }

    debug(...data: unknown[]) {
        if (!Blob.Environment.development)
            return;

        const msg = this.format("D", data);
        console.error(...msg, "\x1b[0m");
    }
}
