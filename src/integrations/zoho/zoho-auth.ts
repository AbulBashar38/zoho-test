import axios from 'axios'
import config from '../../app/config'

type TZohoTokenResponse = {
    access_token?: string
    api_domain?: string
    token_type?: string
    expires_in?: number
    error?: string
}

// Refresh a minute early so a token never expires mid-request.
const EXPIRY_BUFFER_MS = 60 * 1000

let cachedToken: { accessToken: string; expiresAt: number } | null = null
let pendingRefresh: Promise<string> | null = null

const requestNewAccessToken = async (): Promise<string> => {
    const { client_id, client_secret, refresh_token, accounts_domain } = config.zoho

    if (!client_id || !client_secret || !refresh_token) {
        throw new Error(
            'Zoho OAuth is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN.',
        )
    }

    // Sent as a form body rather than query params so the secrets never end up in URLs or logs.
    const body = new URLSearchParams({
        refresh_token,
        client_id,
        client_secret,
        grant_type: 'refresh_token',
    })

    let data: TZohoTokenResponse
    try {
        const response = await axios.post<TZohoTokenResponse>(
            `${accounts_domain}/oauth/v2/token`,
            body,
        )
        data = response.data
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Zoho OAuth Error:', error.response?.status, error.response?.data)
            throw new Error(
                `Zoho OAuth token request failed (HTTP ${error.response?.status ?? 'no response'}): ${JSON.stringify(error.response?.data ?? error.message)}`,
            )
        }
        throw error
    }

    // Zoho answers a bad refresh token / client with HTTP 200 and an `error` field.
    if (!data.access_token) {
        console.error('Zoho OAuth Error:', data)
        throw new Error(
            `Zoho OAuth token request failed: ${data.error ?? 'no access_token in response'}`,
        )
    }

    cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - EXPIRY_BUFFER_MS,
    }

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
