import { TrusterIssuer } from "../type/truster-issuer";
import { configService } from "./config.service";
import { logger } from "./logger";
import { normalizeIssuerUrl, registerIssuer, unregisterIssuer } from "./registry-client";

class TirService {
    tirUrl: URL;

    constructor(tirUrl: string) {
        this.tirUrl = normalizeIssuerUrl(tirUrl);
    }

    async registerDid(trusterIssuer: TrusterIssuer): Promise<void> {
        try {
            await registerIssuer(this.tirUrl, trusterIssuer);
        } catch (error) {
            logger.error("Error adding did to TIR:", error);
            throw error;
        }
    }

    async deleteDid(did: string): Promise<boolean> {
        try {
            return await unregisterIssuer(this.tirUrl, did);
        } catch (error) {
            logger.error("Error removing did from TIR", error);
            return false
        }
    }
}

export const tirService = new TirService(configService.get().app.tir.url)
