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

        try {
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

        } catch(error) {
            logger.error("Unable to login", error);
            res.status(500).json({
                error: 'Unable to login. Try it later'
            })
        }
    }

    async refresh(req: Request, res: Response) {
        const refreshToken = req.body.refresh_token || req.cookies?.refresh_token;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token missing' });
        }

        try {
            const issuer = await oidcService.getIssuer();

            const tokens: client.TokenEndpointResponse = await client.refreshTokenGrant(
                issuer,
                refreshToken
            );

            oidcService._setTokenCookie(tokens, req, res);

            return res.json({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_in: tokens.expires_in
            });

        } catch (err) {
            logger.error('Error refreshing token', err);
            return res.status(403).json({ error: 'Invalid refresh token' });
        }
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
            let token: client.TokenEndpointResponse = await client.authorizationCodeGrant(
                issuer, url, params
            )
            this._setTokenCookie(token, req, res);

            let callbackPath = `/callback?access_token=${token.access_token}`;
            if (token.refresh_token) {
                callbackPath += `&refresh_token=${token.refresh_token}`;
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
        const result = await jwtVerify(accessToken, this.jwks, { issuer: metadata.issuer })
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

    private _setTokenCookie(token: client.TokenEndpointResponse, req: Request, res: Response) {
        res.cookie('authorization', token.access_token, { httpOnly: req.protocol === 'https', maxAge: token.expires_in ? token.expires_in * 1000 : undefined });
        res.cookie('refresh_token', token.refresh_token, { httpOnly: req.protocol === 'https' });
    }
}

export const oidcService = new OidcService();