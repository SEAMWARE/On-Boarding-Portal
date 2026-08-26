import { TrusterIssuer } from "../type/truster-issuer";
import { externalRequest, logger } from "./logger";

export function normalizeIssuerUrl(url: string | URL): URL {
    const parsed = new URL(url);
    if (parsed.pathname === '/') {
        parsed.pathname = '/issuer';
    }
    return parsed;
}

export async function registerIssuer(
    url: URL,
    trusterIssuer: TrusterIssuer,
    credentials: TrusterIssuer['credentials'] = trusterIssuer.credentials,
): Promise<void> {
    logger.info(`Register DID ${trusterIssuer.did} in ${url}`)

    const start = process.hrtime();
    const body: TrusterIssuer = { ...trusterIssuer, credentials };
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
}

export async function unregisterIssuer(url: URL, did: string): Promise<boolean> {
    logger.info(`Unregister DID ${did} from ${url}`)

    const start = process.hrtime();
    const response = await fetch(`${url}/${did}`, {
        method: 'DELETE',
    });
    externalRequest(response, url, 'DELETE', start);
    if (!response.ok) {
        logger.debug(`Error removing DID '${did}' from '${url}' ${response.status}: ${response.body}`)
        return false;
    }

    return true;
}
