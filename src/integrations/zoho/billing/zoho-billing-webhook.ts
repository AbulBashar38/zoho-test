import { prisma } from '../../../app/lib/prisma'
import { mirrorInvoice, mirrorPayment, mirrorSubscription } from './zoho-billing.service'
import type { TZohoBillingInvoice } from './zoho-billing-invoice'
import type { TZohoSubscription } from './zoho-billing-subscription'

type TZohoWebhookPayload = {
    event_id?: string
    event_type?: string
    data?: {
        invoice?: TZohoBillingInvoice
        subscription?: TZohoSubscription
        payment?: {
            payment_id: string
            customer_id: string
            amount: number
            payment_mode?: string
            reference_number?: string
            invoices?: { invoice_id: string; amount_applied: number }[]
        }
    }
}

// Zoho sends the event name in the body, but the shape varies by configuration, so fall
// back to whatever identifying field is present.
const getEventType = (payload: TZohoWebhookPayload, fallback?: string) =>
    payload.event_type ?? fallback ?? 'unknown'

const findUserByCustomerId = async (customerId?: string) => {
    if (!customerId) return null

    const user = await prisma.user.findUnique({
        where: { zohoBillingCustomerId: customerId },
        select: { id: true },
    })

    return user?.id ?? null
}

const handlePaymentThankyou = async (payload: TZohoWebhookPayload) => {
    const payment = payload.data?.payment

    if (!payment?.payment_id) {
        throw new Error('payment_thankyou payload had no payment_id')
    }

    // One payment can settle several invoices; mirror the applied amount against each.
    const applications = payment.invoices?.length
        ? payment.invoices
        : payload.data?.invoice
          ? [{ invoice_id: payload.data.invoice.invoice_id, amount_applied: payment.amount }]
          : []

    for (const application of applications) {
        const userId = await findUserByCustomerId(payment.customer_id)

        // The invoice row must exist before a payment can reference it.
        const existing = await prisma.zohoBillingInvoice.findUnique({
            where: { zohoInvoiceId: application.invoice_id },
            select: { id: true },
        })

        if (!existing && payload.data?.invoice) {
            await mirrorInvoice(payload.data.invoice, userId)
        }

        if (!existing && !payload.data?.invoice) {
            console.warn(
                `Zoho webhook: payment ${payment.payment_id} references unknown invoice ${application.invoice_id}`,
            )
            continue
        }

        await mirrorPayment({
            paymentId: payment.payment_id,
            invoiceId: application.invoice_id,
            customerId: payment.customer_id,
            amount: application.amount_applied ?? payment.amount,
            paymentMode: payment.payment_mode,
            referenceNumber: payment.reference_number,
        })

        await prisma.zohoBillingInvoice.update({
            where: { zohoInvoiceId: application.invoice_id },
            data: { status: 'paid', balance: 0, paidAt: new Date() },
        })
    }
}

export const handleZohoBillingWebhook = async (
    payload: TZohoWebhookPayload,
    eventTypeFromQuery?: string,
) => {
    const eventType = getEventType(payload, eventTypeFromQuery)

    // Store every delivery first; a duplicate event_id short-circuits the work below.
    if (payload.event_id) {
        const seen = await prisma.zohoWebhookEvent.findUnique({
            where: { eventId: payload.event_id },
            select: { id: true, processed: true },
        })

        if (seen?.processed) {
            return { eventType, duplicate: true }
        }
    }

    const record = await prisma.zohoWebhookEvent.create({
        data: {
            eventType,
            eventId: payload.event_id,
            payload: payload as object,
        },
    })

    try {
        switch (eventType) {
            case 'payment_thankyou':
                await handlePaymentThankyou(payload)
                break

            case 'invoice_created':
                if (payload.data?.invoice) {
                    const userId = await findUserByCustomerId(payload.data.invoice.customer_id)
                    await mirrorInvoice(payload.data.invoice, userId)
                }
                break

            case 'subscription_created':
            case 'subscription_cancelled':
                if (payload.data?.subscription) {
                    const userId = await findUserByCustomerId(payload.data.subscription.customer_id)
                    await mirrorSubscription(payload.data.subscription, userId)
                }
                break

            default:
                console.log(`Zoho webhook: ignoring unhandled event type "${eventType}"`)
        }

        await prisma.zohoWebhookEvent.update({
            where: { id: record.id },
            data: { processed: true },
        })

        return { eventType, duplicate: false }
    } catch (error) {
        // Record why it failed, then rethrow so the caller answers with an error status and
        // Zoho retries the delivery.
        await prisma.zohoWebhookEvent.update({
            where: { id: record.id },
            data: { error: (error as Error).message },
        })

        throw error
    }
}
