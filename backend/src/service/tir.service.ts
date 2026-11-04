import { TirConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { configService } from "./config.service";
import { logger } from "./logger";
import { normalizeIssuerUrl, registerIssuer, RegisterOptions, unregisterIssuer, validateRegistryConfig } from "./registry-client";

export class TirService {
    tirUrl: URL;
    private readonly options: RegisterOptions;

    constructor(tirConfig: TirConfig) {
        validateRegistryConfig(tirConfig);
        const { url, credentials, dataspaceId } = tirConfig;
        this.tirUrl = normalizeIssuerUrl(url);
        this.options = { credentials, dataspaceId };
    }

    /** Throws on failure, so the caller can roll back the approval. */
    async registerDid(trusterIssuer: TrusterIssuer): Promise<TrustWrite> {
        try {
            const scope = await registerIssuer(this.tirUrl, trusterIssuer, this.options);
            return { registry: this.tirUrl.toString(), scope };
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

export const tirService = new TirService(configService.get().app.tir)
