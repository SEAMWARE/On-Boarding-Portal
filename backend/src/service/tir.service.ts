import { TrusterIssuer } from "../type/truster-issuer";
import { configService } from "./config.service";

class TirService {
    tirUrl: URL;

    constructor(tirUrl: string) {
        const url = new URL(tirUrl);
        if (url.pathname === '/') {
            url.pathname = '/issuer'
        }
        this.tirUrl = url;
    }

    async registerDid(trusterIssuer: TrusterIssuer): Promise<any> {
        try {
            const response = await fetch(this.tirUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(trusterIssuer),
            });

            if (!response.ok) {
                throw new Error(`Error registering did: ${response.status} ${response.statusText}`);
            }

            return response.body;
        } catch (error) {
            console.error("Error adding did to TIR:", error);
            throw error;
        }
    }
}

export const tirService = new TirService(configService.get().app.tir.url)