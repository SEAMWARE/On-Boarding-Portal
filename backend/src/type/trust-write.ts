/** How the portal wrote a participant into one registry (TIR or TIL), so removal can match it. */
export interface TrustWrite {
    // Normalized registry URL.
    registry: string;
    // `dataspaceId` of the membership grant, or `null` when written unscoped.
    scope: string | null;
}
