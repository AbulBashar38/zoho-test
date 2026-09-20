import { prisma } from '../../../app/lib/prisma'
import { mirrorInvoice, mirrorPayment, mirrorSubscription } from './zoho-billing.service'
import { getZohoBillingInvoice, type TZohoBillingInvoice } from './zoho-billing-invoice'
import type { TZohoSubscription } from './zoho-billing-subscription'

type TZohoPayment = {
    payment_id: string
    customer_id: string
    amount: number
    payment_mode?: string
    reference_number?: string
    invoices?: { invoice_id: string; amount_applied: number }[]
}

type TZohoEventBody = {
    invoice?: TZohoBillingInvoice
    subscription?: TZohoSubscription
    payment?: TZohoPayment
}

// Zoho nests the entities under `data` on webhook deliveries and under `payload` on the
// events API, and `payload` can arrive as a JSON string. Accept all three, and fall back to
// the top level so an unexpected shape still finds the entity.
type TZohoWebhookPayload = TZohoEventBody & {
    event_id?: string
    event_type?: string
    data?: TZohoEventBody
    payload?: TZohoEventBody | string
}

const getEventBody = (payload: TZohoWebhookPayload): TZohoEventBody => {
    if (payload.data) return payload.data

    if (typeof payload.payload === 'string') {
        try {
            return JSON.parse(payload.payload) as TZohoEventBody
        } catch {
            return payload
        }
    }

    return payload.payload ?? payload
}

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

// Makes sure the invoice exists locally before a payment references it, pulling it from
// Zoho when the webhook body does not carry it.
const ensureInvoiceMirrored = async (
    invoiceId: string,
    body: TZohoEventBody,
    userId: string | null,
) => {
    const existing = await prisma.zohoBillingInvoice.findUnique({
        where: { zohoInvoiceId: invoiceId },
        select: { id: true },
    })

    if (existing) return true

    if (body.invoice?.invoice_id === invoiceId) {
        await mirrorInvoice(body.invoice, userId)
        return true
    }

    try {
        const invoice = await getZohoBillingInvoice(invoiceId)
        await mirrorInvoice(invoice, userId)
        return true
    } catch (error) {
        console.error(
            `Zoho webhook: could not fetch invoice ${invoiceId}`,
            (error as Error).message,
        )
        return false
    }
}

const handlePaymentThankyou = async (body: TZohoEventBody) => {
    const payment = body.payment

    if (!payment?.payment_id) {
        throw new Error('payment_thankyou payload had no payment_id')
    }

    // One payment can settle several invoices; record the applied amount against each.
    const applications = payment.invoices?.length
        ? payment.invoices
        : body.invoice
          ? [{ invoice_id: body.invoice.invoice_id, amount_applied: payment.amount }]
          : []

    if (!applications.length) {
        throw new Error(`payment_thankyou for payment ${payment.payment_id} referenced no invoice`)
    }

    const userId = await findUserByCustomerId(payment.customer_id)

    for (const application of applications) {
        const mirrored = await ensureInvoiceMirrored(application.invoice_id, body, userId)

        if (!mirrored) continue

        await mirrorPayment({
            paymentId: payment.payment_id,
            invoiceId: application.invoice_id,
            customerId: payment.customer_id,
            amount: application.amount_applied ?? payment.amount,
            paymentMode: payment.payment_mode,
            referenceNumber: payment.reference_number,
        })

        console.log(
            `  payment ${payment.payment_id} applied ${application.amount_applied} to invoice ${application.invoice_id}`,
        )

        // Re-read the invoice so the stored status and balance reflect Zoho exactly, which
        // matters when a payment only partly settles it.
        try {
            const invoice = await getZohoBillingInvoice(application.invoice_id)
            await mirrorInvoice(invoice, userId)
            console.log(`  invoice now: status=${invoice.status} balance=${invoice.balance}`)
        } catch {
            await prisma.zohoBillingInvoice.update({
                where: { zohoInvoiceId: application.invoice_id },
                data: { status: 'paid', balance: 0, paidAt: new Date() },
            })
        }
    }
}

export const handleZohoBillingWebhook = async (
    payload: TZohoWebhookPayload,
    eventTypeFromQuery?: string,
) => {
    const eventType = getEventType(payload, eventTypeFromQuery)
    const body = getEventBody(payload)

    console.log('event type:', eventType, payload.event_id ? `(event_id ${payload.event_id})` : '')
    console.log('entities  :', {
        invoice: body.invoice?.invoice_id,
        subscription: body.subscription?.subscription_id,
        payment: body.payment?.payment_id,
    })

    // A repeat delivery of an event already handled is a no-op.
    if (payload.event_id) {
        const seen = await prisma.zohoWebhookEvent.findUnique({
            where: { eventId: payload.event_id },
            select: { processed: true },
        })

        if (seen?.processed) {
            return { eventType, duplicate: true }
        }
    }

    // Stored before processing, so an unhandled shape can still be inspected afterwards.
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
                await handlePaymentThankyou(body)
                break

            case 'invoice_created':
            case 'invoice_updated':
            case 'invoice_notification':
                if (body.invoice) {
                    const userId = await findUserByCustomerId(body.invoice.customer_id)
                    await mirrorInvoice(body.invoice, userId)
                }
                break

            case 'subscription_created':
            case 'subscription_activation':
            case 'subscription_cancelled':
            case 'subscription_expired':
            case 'subscription_renewed':
                if (body.subscription) {
                    const userId = await findUserByCustomerId(body.subscription.customer_id)
                    await mirrorSubscription(body.subscription, userId)
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
        // Record why it failed, then rethrow so the response is an error and Zoho retries.
        await prisma.zohoWebhookEvent.update({
            where: { id: record.id },
            data: { error: (error as Error).message },
        })

        throw error
    }
}
