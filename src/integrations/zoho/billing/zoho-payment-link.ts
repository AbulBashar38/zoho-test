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
    // yyyy-mm-dd, optional. Zoho defaults to 15 days when omitted.
    expiryTime?: string
}

// description is the only free-text field a payment link accepts — there are no line items
// and no custom fields on create — so Zoho's record of what was bought lives or dies here.
export const DESCRIPTION_MAX_LENGTH = 200

export const buildPaymentLinkDescription = (description: string | undefined, reference: string) => {
    const text = description?.trim()

    if (!text) return `Order ${reference}`

    // Always carry the reference, so a link in the Zoho console can be traced to an order.
    if (text.includes(reference)) return text.slice(0, DESCRIPTION_MAX_LENGTH)

    const suffix = ` (${reference})`

    return `${text.slice(0, DESCRIPTION_MAX_LENGTH - suffix.length)}${suffix}`
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

export const listZohoPaymentLinks = async (params: Record<string, string | number> = {}) => {
    const response = await zohoBillingClient.get<{ payment_links: TZohoPaymentLink[] }>(
        '/paymentlinks',
        { params },
    )

    return response.data.payment_links ?? []
}

// Every link belonging to one customer, in a single call. Used for reconciliation instead
// of fetching each pending link on its own.
export const listCustomerPaymentLinks = async (customerId: string) =>
    listZohoPaymentLinks({ customer_id: customerId, filter_by: 'Status.All', per_page: 200 })

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
