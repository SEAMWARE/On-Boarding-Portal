import { RegistryConfig } from "../type/app-config";
import { IssuerCredentials, TrusterIssuer } from "../type/truster-issuer";
import { externalRequest, logger } from "./logger";

export const SCOPE_PARAM = 'scope';
export const SCOPE_TYPE_PARAM = 'scopeType';
// TIL-1 (#95) `ScopeType` of a data space membership grant.
export const SCOPE_TYPE_DATASPACE_MEMBERSHIP = 'dataspace-membership';
const SCOPED_CREDENTIALS_PATH = 'credential';
// A TIL-1 scoped PUT creates a missing issuer and never answers 404, so these statuses mean the
// registry predates TIL-1 (unknown route) and the unscoped legacy POST is used instead.
const SCOPED_WRITE_UNSUPPORTED_STATUSES: ReadonlySet<number> = new Set([404, 405, 501]);
// 409 is what TIL-1 answers for an existing issuer; 419 is kept for older registries.
const ALREADY_REGISTERED_STATUSES: ReadonlySet<number> = new Set([409, 419]);

/** The registry already holds an issuer with this DID, written by an earlier approval or another party. */
export class AlreadyRegisteredError extends Error {}

export interface RegisterOptions {
    credentials?: IssuerCredentials[];
    dataspaceId?: string;
}

export function normalizeIssuerUrl(url: string | URL): URL {
    const parsed = new URL(url);
    if (parsed.pathname === '/') {
        parsed.pathname = '/issuer';
    }
    return parsed;
}

/** Returns a copy of `url` addressing the membership grant of `dataspaceId`. */
export function withScope(url: URL, dataspaceId: string): URL {
    const scoped = new URL(url);
    scoped.searchParams.set(SCOPE_PARAM, dataspaceId);
    scoped.searchParams.set(SCOPE_TYPE_PARAM, SCOPE_TYPE_DATASPACE_MEMBERSHIP);
    return scoped;
}

/** Fails fast on a scoped entry without credentials: TIL-1 stores the scope per credential only. */
export function validateRegistryConfig({ url, credentials, dataspaceId }: RegistryConfig): void {
    if (dataspaceId && !credentials?.length) {
        throw new Error(`Registry '${url}' sets dataspaceId but no credentials; a membership grant needs at least one credential`);
    }
}

/**
 * Writes the issuer's trust and returns the scope it was written with, or `null` if unscoped.
 * With `dataspaceId` the credentials are granted through the idempotent TIL-1 scoped PUT.
 */
export async function registerIssuer(
    url: URL,
    trusterIssuer: TrusterIssuer,
    options: RegisterOptions = {},
): Promise<string | null> {
    // `??`, not a destructuring default: an empty YAML `credentials:` key parses as `null`.
    const credentials = options.credentials ?? trusterIssuer.credentials;
    const { dataspaceId } = options;
    if (dataspaceId) {
        logger.info(`Grant DID ${trusterIssuer.did} membership of ${dataspaceId} in ${url}`)
        const scopedUrl = withScope(new URL(`${url}/${trusterIssuer.did}/${SCOPED_CREDENTIALS_PATH}`), dataspaceId);
        const response = await send(scopedUrl, 'PUT', credentials);
        if (response.ok) {
            return dataspaceId;
        }
        if (!SCOPED_WRITE_UNSUPPORTED_STATUSES.has(response.status)) {
            throw new Error(`Error registering did: ${response.status} ${response.statusText}`);
        }
        logger.warn(`Registry '${url}' does not support scoped writes (${response.status}), registering DID ${trusterIssuer.did} unscoped`);
    }

    logger.info(`Register DID ${trusterIssuer.did} in ${url}`)
    const body: TrusterIssuer = { ...trusterIssuer, credentials };
    const response = await send(url, 'POST', body);
    if (!response.ok) {
        if (ALREADY_REGISTERED_STATUSES.has(response.status)) {
            throw new AlreadyRegisteredError(`DID '${trusterIssuer.did}' already registered`)
        }
        throw new Error(`Error registering did: ${response.status} ${response.statusText}`);
    }
    return null;
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

async function send(url: URL, method: string, body: unknown): Promise<Response> {
    const start = process.hrtime();
    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    externalRequest(response, url, method, start);
    return response;
}
