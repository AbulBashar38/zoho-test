import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import config from '../../app/config'
import { clearZohoAccessToken, getZohoAccessToken } from './zoho-auth'

type TZohoErrorBody = { code?: number; message?: string }

type TRetriableRequestConfig = AxiosRequestConfig & { _retriedAfter401?: boolean }

export class ZohoApiError extends Error {
    statusCode?: number
    category: string
    endpoint: string
    zohoCode?: number
    zohoResponse?: unknown

    constructor(params: {
        statusCode?: number
        category: string
        endpoint: string
        zohoCode?: number
        zohoMessage: string
        zohoResponse?: unknown
    }) {
        super(
            `Zoho API ${params.endpoint} failed — HTTP ${params.statusCode ?? 'no response'} (${params.category}): ${params.zohoMessage}${params.zohoCode !== undefined ? ` [Zoho code ${params.zohoCode}]` : ''}`,
        )
        this.name = 'ZohoApiError'
        this.statusCode = params.statusCode
        this.category = params.category
        this.endpoint = params.endpoint
        this.zohoCode = params.zohoCode
        this.zohoResponse = params.zohoResponse
    }
}

const describeStatus = (status?: number) => {
    if (status === undefined) return 'no response from Zoho'
    if (status === 400) return 'invalid request/payload'
    if (status === 401) return 'access token problem'
    if (status === 403) return 'permission/scope problem'
    if (status === 404) return 'resource not found'
    if (status === 429) return 'rate limit exceeded'
    if (status >= 500) return 'Zoho server error'
    return 'unexpected response'
}

const toZohoApiError = (
    status: number | undefined,
    body: TZohoErrorBody | undefined,
    request: AxiosRequestConfig | undefined,
    fallbackMessage?: string,
) => {
    const endpoint = `${request?.method?.toUpperCase() ?? ''} ${request?.url ?? ''}`.trim()
    const category = describeStatus(status)

    console.error(`Zoho API Error: ${endpoint} -> HTTP ${status ?? '-'} (${category})`, body)

    return new ZohoApiError({
        statusCode: status,
        category,
        endpoint,
        zohoCode: body?.code,
        zohoMessage: body?.message ?? fallbackMessage ?? 'Unknown error',
        zohoResponse: body,
    })
}

// Books and Billing share the OAuth token and error handling but differ in base URL and in
// how each identifies the organization, so the per-request tweak is supplied by the caller.
export const createZohoClient = (options: {
    baseURL: string
    decorateRequest?: (request: InternalAxiosRequestConfig) => void
}) => {
    const client = axios.create({
        baseURL: options.baseURL,
        headers: { 'Content-Type': 'application/json' },
    })

    client.interceptors.request.use(async (request) => {
        request.headers.Authorization = `Zoho-oauthtoken ${await getZohoAccessToken()}`
        options.decorateRequest?.(request)
        return request
    })

    client.interceptors.response.use(
        (response) => {
            // Zoho reports failures with a non-zero `code`; guard against one arriving on a 2xx.
            const code = (response.data as TZohoErrorBody | undefined)?.code
            if (code !== undefined && code !== 0) {
                throw toZohoApiError(response.status, response.data, response.config)
            }
            return response
        },
        async (error) => {
            if (!axios.isAxiosError(error)) throw error

            const request = error.config as TRetriableRequestConfig | undefined

            // A cached token can be revoked before its expiry — refresh it and retry once.
            if (error.response?.status === 401 && request && !request._retriedAfter401) {
                request._retriedAfter401 = true
                clearZohoAccessToken()
                return client(request)
            }

            throw toZohoApiError(
                error.response?.status,
                error.response?.data,
                request,
                error.message,
            )
        },
    )

    return client
}

export const zohoClient = createZohoClient({
    baseURL: `${config.zoho.api_domain}/books/v3`,
    decorateRequest: (request) => {
        // Every Books endpoint except GET /organizations requires organization_id.
        if (config.zoho.organization_id) {
            request.params = { ...request.params, organization_id: config.zoho.organization_id }
        }
    },
})
