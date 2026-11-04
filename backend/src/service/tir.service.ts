import { TirConfig } from "../type/app-config";
import { TrusterIssuer } from "../type/truster-issuer";
import { TrustWrite } from "../type/trust-write";
import { configService } from "./config.service";
import { logger } from "./logger";
import { normalizeIssuerUrl, registerIssuer, RegisterOptions, RegistryRemoval, removeRecordedTrust, validateRegistryConfig } from "./registry-client";

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

    /** Removes the trust recorded in `trustWrites`; a thrown error becomes `failed`. */
    async deleteDid(did: string, trustWrites: TrustWrite[] | null): Promise<RegistryRemoval> {
        const registry = this.tirUrl.toString();
        try {
            return { registry, outcome: await removeRecordedTrust(this.tirUrl, did, trustWrites) };
        } catch (error) {
            logger.error("Error removing did from TIR", error);
            return { registry, outcome: 'failed' };
        }
    }
}

export const tirService = new TirService(configService.get().app.tir)
