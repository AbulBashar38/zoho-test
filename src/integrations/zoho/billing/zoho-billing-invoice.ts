import config from '../../../app/config'
import { zohoBillingClient } from './zoho-billing-client'

export type TZohoBillingInvoice = {
    invoice_id: string
    number?: string
    invoice_number?: string
    customer_id: string
    subscription_id?: string
    status: string
    total: number
    balance: number
    currency_code?: string
    invoice_url?: string
    date?: string
    due_date?: string
}

export const getZohoBillingInvoice = async (invoiceId: string) => {
    const response = await zohoBillingClient.get<{ invoice: TZohoBillingInvoice }>(
        `/invoices/${invoiceId}`,
    )

    return response.data.invoice
}

export const listZohoBillingInvoices = async (params: Record<string, string> = {}) => {
    const response = await zohoBillingClient.get<{ invoices: TZohoBillingInvoice[] }>('/invoices', {
        params,
    })

    return response.data.invoices ?? []
}

// Billing's equivalent of "mark as sent" — a draft invoice is not payable or shareable.
export const convertInvoiceToOpen = async (invoiceId: string) => {
    await zohoBillingClient.post(`/invoices/${invoiceId}/converttoopen`)
}

// Hosted payment page for one invoice. Preferred over the Payment Links API, which would
// need the resulting link applied to the invoice by hand.
export const createInvoicePaymentPage = async (invoiceId: string, redirectUrl?: string) => {
    const response = await zohoBillingClient.post<{
        hostedpage: { url: string; hostedpage_id: string }
    }>('/hostedpages/invoicepayment', {
        invoice_id: invoiceId,
        ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    })

    return response.data.hostedpage
}

export const getInvoiceReturnUrl = () =>
    `${config.bak_url ?? 'http://localhost:5000'}/api/billing/return`
