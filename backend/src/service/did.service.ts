import { configService } from "./config.service";

class DidService {

    didWebHost: string;
    constructor(didWebHost: string) {
        this.didWebHost = didWebHost;
    }
    generateDid(realm: string): string {

        const subpath = Buffer.from(realm).toString('base64');
        return `${this.didWebHost}:${subpath}`;
    }
    getRealmFromDid(did: string): string {
        const realmBase64 = did.split(':').at(-1) || '';
        return Buffer.from(realmBase64, 'base64').toString('utf-8');
    }
}

const { didWebHost } = configService.get().didGenerator
export const didService = new DidService(didWebHost);