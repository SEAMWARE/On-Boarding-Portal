import { TrusterIssuer } from "../type/truster-issuer";
import { configService } from "./config.service";
import { externalRequest, logger } from "./logger";

class TirService {
    tirUrl: URL;

    constructor(tirUrl: string) {
        const url = new URL(tirUrl);
        if (url.pathname === '/') {
            url.pathname = '/issuer'
        }
        this.tirUrl = url;
    }

    async registerDid(trusterIssuer: TrusterIssuer): Promise<void> {
        logger.info(`Register DID ${trusterIssuer.did}`)
        const start = process.hrtime();
        try {
            const response = await fetch(this.tirUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(trusterIssuer),
            });
            externalRequest(response, this.tirUrl, 'POST', start);
            if (!response.ok) {
                if (response.status === 419) {
                    throw new Error(`DID '${trusterIssuer.did}' already registered`)
                }
                throw new Error(`Error registering did: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            logger.error("Error adding did to TIR:", error);
            throw error;
        }
    }

    async deleteDid(did: string): Promise<boolean> {
        const start = process.hrtime();
        try {
            logger.info(`Unregister DID ${did}`)
            const response = await fetch(`${this.tirUrl}/${did}`, {
                method: 'DELETE',
            });
            externalRequest(response, this.tirUrl, 'POST', start);
            if (!response.ok) {
                logger.debug(`Error removing DID '${did}' ${response.status}: ${response.body}`)
                return false;
            }

            return true;
        } catch (error) {
            logger.error("Error removing did from TIR", error);
            return false
        }
    }
}

export const tirService = new TirService(configService.get().app.tir.url)