import { TilConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { configService } from "./config.service";
import { logger } from "./logger";
import { normalizeIssuerUrl, registerIssuer, unregisterIssuer, validateRegistryConfig } from "./registry-client";

interface TilEntry {
    url: URL;
    credentials?: TilConfig['credentials'];
    dataspaceId?: string;
}

export class TilService {
    private readonly tilEntries: TilEntry[];

    constructor(tilConfigs: TilConfig[] = []) {
        tilConfigs.forEach(validateRegistryConfig);
        this.tilEntries = tilConfigs.map(({ url, credentials, dataspaceId }) => ({
            url: normalizeIssuerUrl(url),
            credentials,
            dataspaceId,
        }));
    }

    /** Best-effort: returns only the TILs written successfully, failures are logged. */
    async registerDid(trusterIssuer: TrusterIssuer): Promise<TrustWrite[]> {
        const writes = await Promise.all(this.tilEntries.map(({ url, credentials, dataspaceId }) =>
            registerIssuer(url, trusterIssuer, { credentials, dataspaceId })
                .then((scope): TrustWrite => ({ registry: url.toString(), scope }))
                .catch((error) => {
                    logger.warn(`Error adding did to TIL '${url}':`, error);
                    return null;
                })
        ));
        return writes.filter((write) => write !== null);
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
