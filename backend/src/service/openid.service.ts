import * as client from 'openid-client';
import { configService } from './config.service';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { logger } from './logger';

const VERIFIER_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const { app } = configService.get();
class OidcService {

    url: URL;
    oidcIssuer?: client.Configuration
    jwks?: ReturnType<typeof createRemoteJWKSet>;

    constructor() {
        this.url = new URL(app.login.openIdUrl);
    }

    async login(req: Request, res: Response) {

        const { codeChallenge, clientId: client_id } = app.login
        const redirect_uri = `${this._getHostUrl(req)}/api/login/callback`
        const state = randomUUID();
        const nonce = randomUUID();
        const issuer = await this.getIssuer();
        const params: Record<string, string> = {
            redirect_uri,
            state,
            nonce,
            client_id,
        }

        if (codeChallenge) {
            params.code_challenge_method = 'S256';
            const verifier = client.randomPKCECodeVerifier()
            res.cookie('pkce_verifier', verifier, { httpOnly: req.protocol === 'https', maxAge: VERIFIER_MAX_AGE_MS });
            params.code_challenge = await client.calculatePKCECodeChallenge(verifier);
        }
        const redirectToUrl: URL = client.buildAuthorizationUrl(issuer, params);
        const redirectTo = decodeURIComponent(redirectToUrl.toString());
        logger.info(`Redirect to ${redirectTo}`)
        res.redirect(redirectTo.toString())
    }

    async callback(req: Request, res: Response) {

        const verifier = req.cookies?.pkce_verifier;
        const state = req.query.state as string;
        const issuer = await this.getIssuer();
        const url = new URL(`${this._getHostUrl(req)}${req.baseUrl}${req.url}`)
        const params: client.AuthorizationCodeGrantChecks = {
            expectedState: state,
        }
        if (verifier) {
            params.pkceCodeVerifier = verifier;
        }
        try {
            let tokens: client.TokenEndpointResponse = await client.authorizationCodeGrant(
                issuer, url, params
            )
            const accessToken = tokens.access_token;
            res.cookie('authorization', accessToken, { httpOnly: req.protocol === 'https', maxAge: tokens.expires_in ? tokens.expires_in * 1000 : undefined });
            let callbackPath = `/callback?access_token=${accessToken}`;
            if (tokens.refresh_token) {
                callbackPath += `&refresh_token=${tokens.refresh_token}`;
            }
            res.redirect(callbackPath);
        } catch (err) {
            logger.error('Error handling callback', err);
            res.status(500).send('Internal server error');
        }
    }

    async validate(accessToken: string): Promise<JWTPayload> {
        const metadata = (await this.getIssuer()).serverMetadata();

        // TODO review this part
        if (!this.jwks) {
            this.jwks = createRemoteJWKSet(new URL(metadata.jwks_uri!))
        }
        const result = await jwtVerify(accessToken, this.jwks, {issuer: metadata.issuer})
        return result.payload;
    }

    private async getIssuer(): Promise<client.Configuration> {
        if (!this.oidcIssuer) {
            try {
                this.oidcIssuer = await client.discovery(this.url, app.login.clientId, app.login.clientSecret)
            } catch (err) {
                logger.error('Error discovering OIDC issuer', err);
                throw err;
            }
        }
        return this.oidcIssuer;
    }

    private _getHostUrl(req: Request) {
        return `${req.protocol}://${req.get('host')}`
    }
}

export const oidcService = new OidcService();