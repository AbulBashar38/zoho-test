import { zohoClient } from './zoho-client'
import { getOrCreateZohoContact } from './zoho-contact'
import { createZohoInvoice, getZohoInvoice, markZohoInvoiceAsSent } from './zoho-invoice'
import { getOrCreateZohoItem } from './zoho-item'
import { createZohoCustomerPayment } from './zoho-payment'

export type TRunZohoTestPayload = {
    userId: string
    amount: number
    itemName: string
    paymentReference: string
    paymentMode?: string
}

export const runZohoOrganizationsTest = async () => {
    const response = await zohoClient.get('/organizations')

    return response.data
}

const validatePayload = (payload: Partial<TRunZohoTestPayload>): TRunZohoTestPayload => {
    const { userId, amount, itemName, paymentReference, paymentMode } = payload ?? {}

    if (typeof userId !== 'string' || !userId) throw new Error('userId is required')
    if (typeof amount !== 'number' || !(amount > 0)) {
        throw new Error('amount must be a positive number')
    }
    if (typeof itemName !== 'string' || !itemName.trim()) throw new Error('itemName is required')
    if (typeof paymentReference !== 'string' || !paymentReference.trim()) {
        throw new Error('paymentReference is required')
    }

    return { userId, amount, itemName: itemName.trim(), paymentReference, paymentMode }
}

export const runZohoTest = async (payload: Partial<TRunZohoTestPayload>) => {
    const { userId, amount, itemName, paymentReference, paymentMode } = validatePayload(payload)

    const contactId = await getOrCreateZohoContact(userId)

    const itemId = await getOrCreateZohoItem({ name: itemName, rate: amount })

    const invoice = await createZohoInvoice({
        customerId: contactId,
        itemId,
        rate: amount,
        referenceNumber: paymentReference,
    })

    await markZohoInvoiceAsSent(invoice.invoice_id)

    // Pay the invoice total (not the raw amount) so any tax applied by Zoho is covered, and
    // reuse the invoice date so the payment is never dated before the invoice.
    const payment = await createZohoCustomerPayment({
        customerId: contactId,
        invoiceId: invoice.invoice_id,
        amount: invoice.total,
        date: invoice.date,
        paymentMode: paymentMode ?? 'cash',
        referenceNumber: paymentReference,
    })

    const paidInvoice = await getZohoInvoice(invoice.invoice_id)

    return {
        zohoContactId: contactId,
        zohoItemId: itemId,
        zohoInvoiceId: invoice.invoice_id,
        zohoInvoiceNumber: invoice.invoice_number,
        zohoInvoiceStatus: paidInvoice.status,
        zohoPaymentId: payment.payment_id,
    }
}
