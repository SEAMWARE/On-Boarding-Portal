import { TilConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { configService } from "./config.service";
import { externalRequest, logger } from "./logger";

class TilService {
    tilConfig: TilConfig[];

    constructor(tilUrls: TilConfig[] = []) {
        this.tilConfig = tilUrls.map((config) => {
            const url = new URL(config.url);
            if (url.pathname === '/') {
                url.pathname = '/issuer'
            }
            config.url = url;
            return config;
        })
    }

    async registerDid(trusterIssuer: TrusterIssuer): Promise<void> {
        await Promise.all(this.tilConfig.map((tilConfig) => this._registerInTil(tilConfig, trusterIssuer)));
    }

    async deleteDid(did: string): Promise<boolean[]> {
        return Promise.all(this.tilConfig.map((tilConfig) => this._deleteOne(tilConfig.url, did)));
    }

    private async _registerInTil({url, credentials}: TilConfig, trusterIssuer: TrusterIssuer): Promise<void> {
        logger.info(`Register DID ${trusterIssuer.did} in ${url}`)

        const start = process.hrtime();
        const body: TrusterIssuer = {...trusterIssuer, credentials: credentials || []}
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            externalRequest(response, url, 'POST', start);
            if (!response.ok) {
                if (response.status === 419) {
                    throw new Error(`DID '${trusterIssuer.did}' already registered`)
                }
                throw new Error(`Error registering did: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            logger.warn(`Error adding did to TIL '${url}':`, error);
        }
    }

    private async _deleteOne(url: URL | string, did: string): Promise<boolean> {
        logger.info(`Unregister DID ${did} from ${url}`)
        const start = process.hrtime();
        try {
            const response = await fetch(`${url}/${did}`, {
                method: 'DELETE',
            });
            externalRequest(response, url, 'POST', start);
            if (!response.ok) {
                logger.debug(`Error removing DID '${did}' from '${url}' ${response.status}: ${response.body}`)
                return false;
            }

            return true;
        } catch (error) {
            logger.warn(`Error removing did from TIL '${url}':`, error);
            return false
        }
    }
}

export const tilService = new TilService(configService.get().app.til)
