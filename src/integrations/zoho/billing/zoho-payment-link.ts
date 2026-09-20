import { zohoBillingClient } from './zoho-billing-client'

export type TZohoPaymentLink = {
    payment_link_id: string
    payment_link_number?: string
    url: string
    status: string
    payment_amount: string | number
    description?: string
    customer_id: string
    customer_name?: string
    expiry_time?: string
    created_time?: string
}

type TCreatePaymentLinkPayload = {
    customerId: string
    amount: number
    description: string
    // yyyy-mm-dd, optional
    expiryTime?: string
}

// Zoho takes payment_amount as a string.
export const createZohoPaymentLink = async ({
    customerId,
    amount,
    description,
    expiryTime,
}: TCreatePaymentLinkPayload) => {
    const response = await zohoBillingClient.post<{ payment_link: TZohoPaymentLink }>(
        '/paymentlinks',
        {
            customer_id: customerId,
            payment_amount: amount.toFixed(2),
            description,
            ...(expiryTime ? { expiry_time: expiryTime } : {}),
        },
    )

    return response.data.payment_link
}

export const getZohoPaymentLink = async (paymentLinkId: string) => {
    const response = await zohoBillingClient.get<{ payment_link: TZohoPaymentLink }>(
        `/paymentlinks/${paymentLinkId}`,
    )

    return response.data.payment_link
}

export const listZohoPaymentLinks = async (params: Record<string, string> = {}) => {
    const response = await zohoBillingClient.get<{ payment_links: TZohoPaymentLink[] }>(
        '/paymentlinks',
        { params },
    )

    return response.data.payment_links ?? []
}

export const cancelZohoPaymentLink = async (paymentLinkId: string) => {
    const response = await zohoBillingClient.post<{ payment_link: TZohoPaymentLink }>(
        `/paymentlinks/${paymentLinkId}/cancel`,
    )

    return response.data.payment_link
}

// Zoho's own wording for a settled link varies by edition, so treat any of these as paid.
const PAID_STATUSES = new Set(['paid', 'success', 'succeeded', 'completed', 'closed'])
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'void', 'voided'])
const EXPIRED_STATUSES = new Set(['expired'])

export const readPaymentLinkStatus = (status?: string) => {
    const value = status?.trim().toLowerCase() ?? ''

    if (PAID_STATUSES.has(value)) return 'PAID' as const
    if (CANCELLED_STATUSES.has(value)) return 'CANCELLED' as const
    if (EXPIRED_STATUSES.has(value)) return 'EXPIRED' as const

    return 'PENDING' as const
}
