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

export type TZohoBooksLineItem = {
    name: string
    description?: string
    rate: number
    quantity: number
    // Optional: links the line to an item in the Books catalogue.
    itemId?: string
}

// An invoice carrying the order's own lines. Prices come from this backend; Books records
// them for accounting.
export const createZohoInvoiceWithLineItems = async (params: {
    customerId: string
    lineItems: TZohoBooksLineItem[]
    referenceNumber?: string
    notes?: string
    date?: string
}) => {
    const response = await zohoClient.post<{ invoice: TZohoInvoice }>('/invoices', {
        customer_id: params.customerId,
        line_items: params.lineItems.map((item) => ({
            // Books caps the line name at 100 characters.
            name: item.name.slice(0, 100),
            ...(item.description ? { description: item.description } : {}),
            rate: item.rate,
            quantity: item.quantity,
            ...(item.itemId ? { item_id: item.itemId } : {}),
        })),
        ...(params.referenceNumber ? { reference_number: params.referenceNumber } : {}),
        ...(params.notes ? { notes: params.notes } : {}),
        ...(params.date ? { date: params.date } : {}),
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
