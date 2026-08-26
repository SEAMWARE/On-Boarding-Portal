import { TilConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { configService } from "./config.service";
import { logger } from "./logger";
import { normalizeIssuerUrl, registerIssuer, unregisterIssuer } from "./registry-client";

interface TilEntry {
    url: URL;
    credentials?: TilConfig['credentials'];
}

class TilService {
    private readonly tilEntries: TilEntry[];

    constructor(tilConfigs: TilConfig[] = []) {
        this.tilEntries = tilConfigs.map(({ url, credentials }) => ({
            url: normalizeIssuerUrl(url),
            credentials,
        }));
    }

    async registerDid(trusterIssuer: TrusterIssuer): Promise<void> {
        await Promise.all(this.tilEntries.map(({ url, credentials }) =>
            registerIssuer(url, trusterIssuer, credentials ?? trusterIssuer.credentials)
                .catch((error) => logger.warn(`Error adding did to TIL '${url}':`, error))
        ));
    }

    async deleteDid(did: string): Promise<boolean[]> {
        return Promise.all(this.tilEntries.map(({ url }) =>
            unregisterIssuer(url, did).catch((error) => {
                logger.warn(`Error removing did from TIL '${url}':`, error);
                return false;
            })
        ));
    }
}

export const tilService = new TilService(configService.get().app.til)
