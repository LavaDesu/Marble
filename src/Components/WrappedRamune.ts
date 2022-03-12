import { Ramune } from "ramune";
import { Blob } from "../Blob";
import { Component, Load } from "../Utils/DependencyInjection";

@Component("Ramune")
export class WrappedRamune extends Ramune {
    constructor() {
        super(Blob.Environment.osuID, Blob.Environment.osuSecret, {
            requestHandler: {
                rateLimit: {
                    limit: 500,
                    interval: 60e3
                }
            }
        });
    }

    @Load
    async load() {
        await this.refreshToken();
    }
}

