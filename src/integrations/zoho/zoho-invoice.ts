import { zohoClient } from './zoho-client'

type TZohoInvoice = {
    invoice_id: string
    invoice_number: string
    date: string
    status: string
    total: number
    balance: number
}

type TCreateZohoInvoicePayload = {
    customerId: string
    itemId: string
    rate: number
    quantity?: number
    referenceNumber?: string
}

export const createZohoInvoice = async ({
    customerId,
    itemId,
    rate,
    quantity = 1,
    referenceNumber,
}: TCreateZohoInvoicePayload) => {
    const response = await zohoClient.post<{ invoice: TZohoInvoice }>('/invoices', {
        customer_id: customerId,
        line_items: [{ item_id: itemId, quantity, rate }],
        reference_number: referenceNumber,
        notes: 'Zoho API integration test',
    })

    return response.data.invoice
}

// Invoices are created as drafts; marking one sent issues it so a payment can be applied.
export const markZohoInvoiceAsSent = async (invoiceId: string) => {
    await zohoClient.post(`/invoices/${invoiceId}/status/sent`)
}

export const getZohoInvoice = async (invoiceId: string) => {
    const response = await zohoClient.get<{ invoice: TZohoInvoice }>(`/invoices/${invoiceId}`)

    return response.data.invoice
}
