import { zohoClient } from './zoho-client'

type TZohoCustomerPayment = {
    payment_id: string
    amount: number
    date: string
    payment_mode: string
    reference_number?: string
}

type TCreateZohoCustomerPaymentPayload = {
    customerId: string
    invoiceId: string
    amount: number
    // yyyy-mm-dd
    date: string
    // Must be a mode the organization accepts, e.g. cash, check, creditcard, banktransfer,
    // bankremittance, autotransaction, others — or a custom mode configured in Zoho Books.
    paymentMode: string
    referenceNumber?: string
}

export const createZohoCustomerPayment = async ({
    customerId,
    invoiceId,
    amount,
    date,
    paymentMode,
    referenceNumber,
}: TCreateZohoCustomerPaymentPayload) => {
    const response = await zohoClient.post<{ payment: TZohoCustomerPayment }>('/customerpayments', {
        customer_id: customerId,
        payment_mode: paymentMode,
        amount,
        date,
        reference_number: referenceNumber,
        invoices: [{ invoice_id: invoiceId, amount_applied: amount }],
    })

    return response.data.payment
}
