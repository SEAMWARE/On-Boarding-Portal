import { configService } from "./config.service";

class DidService {

    didWebHost: string;
    constructor(didWebHost: string) {
        this.didWebHost = didWebHost;
    }
    generateDid(realm: string): string {

        return `${this.didWebHost}:${realm}`;
    }
    getRealmFromDid(did: string): string {
        return did.split(':').at(-1) || '';
    }
}

const { didWebHost } = configService.get().didGenerator
export const didService = new DidService(didWebHost);