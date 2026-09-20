import axios from 'axios'
import config from '../../app/config'
import { prisma } from '../../app/lib/prisma'

type TZohoTokenResponse = {
    access_token?: string
    refresh_token?: string
    api_domain?: string
    token_type?: string
    scope?: string
    expires_in?: number
    error?: string
}

// Refresh a minute early so a token never expires mid-request.
const EXPIRY_BUFFER_MS = 60 * 1000

let cachedToken: { accessToken: string; expiresAt: number } | null = null
let pendingRefresh: Promise<string> | null = null

const getOAuthCredentials = () => {
    const { client_id, client_secret, accounts_domain } = config.zoho

    if (!client_id || !client_secret) {
        throw new Error('Zoho OAuth is not configured. Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.')
    }

    return { clientId: client_id, clientSecret: client_secret, accountsDomain: accounts_domain }
}

// Both grant types post to the same endpoint. Values go in the form body rather than query
// params so the secrets never end up in URLs or logs.
const requestToken = async (params: Record<string, string>): Promise<TZohoTokenResponse> => {
    const { accountsDomain } = getOAuthCredentials()

    try {
        const response = await axios.post<TZohoTokenResponse>(
            `${accountsDomain}/oauth/v2/token`,
            new URLSearchParams(params),
        )
        return response.data
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Zoho OAuth Error:', error.response?.status, error.response?.data)
            throw new Error(
                `Zoho OAuth token request failed (HTTP ${error.response?.status ?? 'no response'}): ${JSON.stringify(error.response?.data ?? error.message)}`,
            )
        }
        throw error
    }
}

// Strips the tokens so a failed exchange can be logged without leaking credentials.
const redactTokenResponse = (data: TZohoTokenResponse) => ({
    error: data.error,
    scope: data.scope,
    api_domain: data.api_domain,
    expires_in: data.expires_in,
    has_access_token: Boolean(data.access_token),
    has_refresh_token: Boolean(data.refresh_token),
})

const cacheAccessToken = (accessToken: string, expiresIn?: number) => {
    cachedToken = {
        accessToken,
        expiresAt: Date.now() + (expiresIn ?? 3600) * 1000 - EXPIRY_BUFFER_MS,
    }
}

export const getStoredZohoIntegration = async () => {
    const { clientId } = getOAuthCredentials()

    return prisma.zohoIntegration.findUnique({ where: { clientId } })
}

// The stored token is the source of truth; ZOHO_REFRESH_TOKEN stays as a fallback so an
// environment authorized the old way keeps working.
const getRefreshToken = async () => {
    const integration = await getStoredZohoIntegration()

    return integration?.refreshToken ?? config.zoho.refresh_token
}

const requestNewAccessToken = async (): Promise<string> => {
    const { clientId, clientSecret } = getOAuthCredentials()
    const refreshToken = await getRefreshToken()

    if (!refreshToken) {
        throw new Error(
            'No Zoho refresh token available. Authorize the integration with POST /api/zoho/authorize, or set ZOHO_REFRESH_TOKEN.',
        )
    }

    const data = await requestToken({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
    })

    // Zoho answers a bad refresh token / client with HTTP 200 and an `error` field.
    if (!data.access_token) {
        console.error('Zoho OAuth Error:', redactTokenResponse(data))
        throw new Error(
            `Zoho OAuth token request failed: ${data.error ?? 'no access_token in response'}`,
        )
    }

    cacheAccessToken(data.access_token, data.expires_in)

    return data.access_token
}

export const getZohoAccessToken = async (): Promise<string> => {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.accessToken
    }

    // Concurrent callers share one in-flight refresh instead of each requesting a token.
    pendingRefresh ??= requestNewAccessToken().finally(() => {
        pendingRefresh = null
    })

    return pendingRefresh
}

export const clearZohoAccessToken = () => {
    cachedToken = null
}

// Exchanges an authorization code for tokens. Used by both the Self Client flow and the
// redirect callback — the only difference is where the code came from.
export const exchangeAuthorizationCode = async (
    code: string,
): Promise<TZohoTokenResponse & { refresh_token: string }> => {
    const { clientId, clientSecret } = getOAuthCredentials()

    const data = await requestToken({
        code: code.trim(),
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        // Zoho requires this to match the redirect URI the code was issued for.
        ...(config.zoho.redirect_uri ? { redirect_uri: config.zoho.redirect_uri } : {}),
    })

    // Zoho returns a refresh token only on the first use of a code, and codes expire within
    // minutes — both failures arrive as HTTP 200 with an `error` field.
    if (!data.refresh_token) {
        console.error('Zoho OAuth Error:', redactTokenResponse(data))
        throw new Error(
            `Zoho authorization code exchange failed: ${data.error ?? 'no refresh_token in response'}. Generate a fresh authorization code and use it within its validity period.`,
        )
    }

    return { ...data, refresh_token: data.refresh_token }
}

// Exchanges an authorization code and stores the refresh token.
// Re-authorizing with a new code (for extra scopes) replaces the stored one.
export const authorizeZohoIntegration = async (payload: { code?: unknown }) => {
    const code = payload?.code

    if (typeof code !== 'string' || !code.trim()) {
        throw new Error('code is required')
    }

    const { clientId } = getOAuthCredentials()

    const data = await exchangeAuthorizationCode(code)

    const integration = await prisma.zohoIntegration.upsert({
        where: { clientId },
        create: {
            clientId,
            organizationId: config.zoho.organization_id,
            refreshToken: data.refresh_token,
            scope: data.scope,
        },
        update: {
            organizationId: config.zoho.organization_id,
            refreshToken: data.refresh_token,
            scope: data.scope,
            authorizedAt: new Date(),
        },
    })

    // Keep the access token that came with the exchange; it already carries the new scopes.
    if (data.access_token) {
        cacheAccessToken(data.access_token, data.expires_in)
    } else {
        clearZohoAccessToken()
    }

    // The refresh token itself is never returned to the caller.
    return {
        organizationId: integration.organizationId,
        scope: integration.scope,
        authorizedAt: integration.authorizedAt,
        accessTokenExpiresIn: data.expires_in,
    }
}
