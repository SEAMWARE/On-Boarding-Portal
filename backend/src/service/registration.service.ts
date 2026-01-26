import { TrusterIssuer } from "../type/truster-issuer";
import { keycloakService } from "./keycloak.service";
import { tirService } from "./tir.service";

class RegistrationService {

    async register(did: string) {
        await keycloakService.createRealm(did);
        const tirIssuer: TrusterIssuer = {
            did,
            credentials: []
        }
        await tirService.registerDid(tirIssuer);
    }
}

export const registrationService = new RegistrationService();