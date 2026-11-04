import { RegistryConfig } from "../type/app-config";
import { TrustWrite } from "../type/trust-write";
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
const STATUS_NOT_FOUND = 404;
// Status codes a pre-TIL-1 registry may answer for the unknown scoped DELETE route. A 404 is
// ambiguous (TIL-1 also uses it for a missing issuer) and is resolved by `classifyScopedDeleteFailure`.
const SCOPED_DELETE_UNSUPPORTED_STATUSES: ReadonlySet<number> = new Set([405, 501]);
// Segments that are empty or that WHATWG URL resolves as dot segments, so they would address
// another resource. `%2e` cannot reach the URL: `didPathSegment` encodes `%` first.
const UNSAFE_PATH_SEGMENTS: ReadonlySet<string> = new Set(['', '.', '..']);
const ENCODED_COLON = /%3A/gi;
// 409 is what TIL-1 answers for an existing issuer; 419 is kept for older registries.
const ALREADY_REGISTERED_STATUSES: ReadonlySet<number> = new Set([409, 419]);

/** The registry already holds an issuer with this DID, written by an earlier approval or another party. */
export class AlreadyRegisteredError extends Error {}

/** What a removal did: `scope-removed` keeps the issuer, `not-found` means the registry did not hold it. */
export type RemovalOutcome = 'issuer-removed' | 'scope-removed' | 'not-found' | 'failed';

/** Outcome of removing a participant from one registry; `outcome` is `null` when nothing was removed. */
export interface RegistryRemoval {
    // Normalized registry URL, comparable with `TrustWrite.registry`.
    registry: string;
    outcome: RemovalOutcome | null;
}

export interface UnregisterOptions {
    // Scope the trust was written with; `null`/absent removes the whole issuer as before TIL-1.
    dataspaceId?: string | null;
}

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

/** Encodes an unvalidated DID as one path segment; `%` becomes `%25` as Micronaut decodes path variables. */
export function didPathSegment(did: string): string {
    if (UNSAFE_PATH_SEGMENTS.has(did)) {
        throw new Error(`'${did}' cannot be addressed as an issuer`);
    }
    return encodeURIComponent(did).replace(ENCODED_COLON, ':');
}

// The issuer resource; every GET and DELETE of `did` must address it identically.
function issuerUrl(url: URL, did: string): URL {
    return new URL(`${url}/${didPathSegment(did)}`);
}

// The TIL-1 resource of `did`'s membership grant in `dataspaceId`.
function scopedCredentialsUrl(url: URL, did: string, dataspaceId: string): URL {
    return withScope(new URL(`${issuerUrl(url, did)}/${SCOPED_CREDENTIALS_PATH}`), dataspaceId);
}

/** Fails fast on a scoped entry without credentials: TIL-1 stores the scope per credential only. */
export function validateRegistryConfig({ url, credentials, dataspaceId }: RegistryConfig): void {
    if (dataspaceId && !credentials?.length) {
        throw new Error(`Registry '${url}' sets dataspaceId but no credentials; a membership grant needs at least one credential`);
    }
}

/** Writes the issuer's trust; returns the scope written with, `null` if unscoped. */
export async function registerIssuer(
    url: URL,
    trusterIssuer: TrusterIssuer,
    options: RegisterOptions = {},
): Promise<string | null> {
    // `??`, not a destructuring default: an empty YAML `credentials:` key parses as `null`.
    const credentials = options.credentials ?? trusterIssuer.credentials;
    const { dataspaceId } = options;
    // Throws before writing an entry no removal could address.
    issuerUrl(url, trusterIssuer.did);
    if (dataspaceId) {
        logger.info(`Grant DID ${trusterIssuer.did} membership of ${dataspaceId} in ${url}`)
        const response = await send(scopedCredentialsUrl(url, trusterIssuer.did, dataspaceId), 'PUT', credentials);
        await discard(response);
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
    await discard(response);
    if (!response.ok) {
        if (ALREADY_REGISTERED_STATUSES.has(response.status)) {
            throw new AlreadyRegisteredError(`DID '${trusterIssuer.did}' already registered`)
        }
        throw new Error(`Error registering did: ${response.status} ${response.statusText}`);
    }
    return null;
}

/** Removes the issuer's trust; with `dataspaceId` only that grant, then the issuer once it holds no credential. */
export async function unregisterIssuer(
    url: URL,
    did: string,
    { dataspaceId }: UnregisterOptions = {},
): Promise<RemovalOutcome> {
    if (dataspaceId) {
        logger.info(`Revoke membership of ${dataspaceId} from DID ${did} in ${url}`)
        const response = await send(scopedCredentialsUrl(url, did, dataspaceId), 'DELETE');
        if (response.ok) {
            await discard(response);
            return removeIssuerIfEmpty(url, did);
        }
        const failure = await classifyScopedDeleteFailure(url, did, response.status);
        if (failure === 'failed') {
            logger.warn(`Error revoking membership of DID '${did}' from '${url}' ${response.status}: ${await response.text()}`);
            return failure;
        }
        await discard(response);
        if (failure === 'not-found') {
            return failure;
        }
        logger.warn(`Registry '${url}' does not support scoped removal (${response.status}), removing DID ${did} unscoped`);
    }
    return deleteIssuer(url, did);
}

/** Removes what `trustWrites` records for `url` by its recorded scope (`null` list: unscoped); `null` = nothing removed. */
export async function removeRecordedTrust(
    url: URL,
    did: string,
    trustWrites: TrustWrite[] | null,
): Promise<RemovalOutcome | null> {
    if (trustWrites === null) {
        return unregisterIssuer(url, did);
    }
    const write = trustWrites.find(({ registry }) => registry === url.toString());
    if (!write) {
        return null;
    }
    if (write.alreadyRegistered) {
        logger.warn(`DID ${did} was already registered in '${url}' before its approval, not removing it; remove it manually if it is the portal's leftover`);
        return null;
    }
    return unregisterIssuer(url, did, { dataspaceId: write.scope });
}

// The legacy whole-issuer DELETE; same request as before TIL-1 unless the DID contains a `%` (now `%25`).
async function deleteIssuer(url: URL, did: string): Promise<RemovalOutcome> {
    logger.info(`Unregister DID ${did} from ${url}`)
    const response = await send(issuerUrl(url, did), 'DELETE');
    if (response.ok) {
        await discard(response);
        return 'issuer-removed';
    }
    logger.debug(`Error removing DID '${did}' from '${url}' ${response.status}: ${await response.text()}`)
    return response.status === STATUS_NOT_FOUND ? 'not-found' : 'failed';
}

// Deletes an issuer the scoped removal left without credentials; `failed` if it may still be listed.
async function removeIssuerIfEmpty(url: URL, did: string): Promise<RemovalOutcome> {
    const response = await send(issuerUrl(url, did), 'GET');
    if (response.status === STATUS_NOT_FOUND) {
        await discard(response);
        return 'issuer-removed';
    }
    if (!response.ok) {
        logger.warn(`Revoked membership of DID '${did}' in '${url}' but could not check what is left ${response.status}: ${await response.text()}`);
        return 'failed';
    }
    const { credentials } = await response.json() as Partial<TrusterIssuer>;
    if (credentials?.length) {
        logger.info(`Kept issuer ${did} in ${url}: it still holds credentials of other grants`);
        return 'scope-removed';
    }
    logger.info(`Issuer ${did} holds no credentials in ${url} after revoking its membership, removing it`);
    // TIL-1 has no conditional DELETE: a credential added since the GET is lost (accepted, see plan Q2).
    const outcome = await deleteIssuer(url, did);
    // Gone in between counts as removed: nothing is listed any more.
    return outcome === 'not-found' ? 'issuer-removed' : outcome;
}

// Decides whether a failed scoped DELETE may fall back to the destructive unscoped one.
async function classifyScopedDeleteFailure(
    url: URL,
    did: string,
    status: number,
): Promise<'unsupported' | 'not-found' | 'failed'> {
    if (SCOPED_DELETE_UNSUPPORTED_STATUSES.has(status)) {
        return 'unsupported';
    }
    if (status !== STATUS_NOT_FOUND) {
        return 'failed';
    }
    // TIL-1 answers 404 only for a missing issuer, so an existing one means the route is unknown
    // (pre-TIL-1). An issuer created between the two requests would be deleted whole; accepted race.
    const response = await send(issuerUrl(url, did), 'GET');
    await discard(response);
    if (response.ok) {
        return 'unsupported';
    }
    return response.status === STATUS_NOT_FOUND ? 'not-found' : 'failed';
}

// Unread bodies hold their undici connection until garbage collection.
async function discard(response: Response): Promise<void> {
    await response.body?.cancel();
}

async function send(url: URL, method: string, body?: unknown): Promise<Response> {
    const start = process.hrtime();
    const response = await fetch(url, body === undefined ? { method } : {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    externalRequest(response, url, method, start);
    return response;
}
