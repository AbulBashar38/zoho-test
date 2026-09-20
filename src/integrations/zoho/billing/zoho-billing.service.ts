import { prisma } from '../../../app/lib/prisma'
import { Prisma } from '../../../generated/prisma/client'
import { getOrCreateZohoBillingCustomer } from './zoho-billing-customer'
import {
    convertInvoiceToOpen,
    createInvoicePaymentPage,
    getInvoiceReturnUrl,
    getZohoBillingInvoice,
    listZohoBillingInvoices,
    type TZohoBillingInvoice,
} from './zoho-billing-invoice'
import {
    createZohoSubscription,
    getZohoPlan,
    type TZohoSubscription,
} from './zoho-billing-subscription'

const toDate = (value?: string | null) => (value ? new Date(value) : null)

const toDecimal = (value?: number | null) =>
    value === undefined || value === null ? new Prisma.Decimal(0) : new Prisma.Decimal(value)

// Mirrors keep the app readable from local data; Zoho stays the source of truth for money.
export const mirrorSubscription = async (
    subscription: TZohoSubscription,
    userId?: string | null,
) => {
    const data = {
        zohoCustomerId: subscription.customer_id,
        planCode: subscription.plan?.plan_code ?? 'unknown',
        planName: subscription.plan?.name,
        status: subscription.status,
        amount: toDecimal(subscription.amount),
        currencyCode: subscription.currency_code,
        referenceId: subscription.reference_id,
        startsAt: toDate(subscription.activated_at),
        nextBillingAt: toDate(subscription.next_billing_at),
        cancelledAt: subscription.status === 'cancelled' ? new Date() : null,
        ...(userId ? { userId } : {}),
    }

    return prisma.zohoBillingSubscription.upsert({
        where: { zohoSubscriptionId: subscription.subscription_id },
        create: { zohoSubscriptionId: subscription.subscription_id, ...data },
        update: data,
    })
}

export const mirrorInvoice = async (invoice: TZohoBillingInvoice, userId?: string | null) => {
    // Only link the subscription once its mirror row exists, or the FK would fail.
    const subscriptionExists = invoice.subscription_id
        ? await prisma.zohoBillingSubscription.findUnique({
              where: { zohoSubscriptionId: invoice.subscription_id },
              select: { id: true },
          })
        : null

    const data = {
        invoiceNumber: invoice.number ?? invoice.invoice_number,
        zohoCustomerId: invoice.customer_id,
        status: invoice.status,
        total: toDecimal(invoice.total),
        balance: toDecimal(invoice.balance),
        currencyCode: invoice.currency_code,
        invoiceUrl: invoice.invoice_url,
        invoiceDate: toDate(invoice.date),
        dueDate: toDate(invoice.due_date),
        paidAt: invoice.status === 'paid' ? new Date() : null,
        zohoSubscriptionId: subscriptionExists ? invoice.subscription_id : null,
        ...(userId ? { userId } : {}),
    }

    return prisma.zohoBillingInvoice.upsert({
        where: { zohoInvoiceId: invoice.invoice_id },
        create: { zohoInvoiceId: invoice.invoice_id, ...data },
        update: data,
    })
}

// Unique on zohoPaymentId, so a replayed payment webhook updates rather than duplicates.
export const mirrorPayment = async (params: {
    paymentId: string
    invoiceId: string
    customerId: string
    amount: number
    paymentMode?: string
    referenceNumber?: string
}) => {
    const data = {
        zohoInvoiceId: params.invoiceId,
        zohoCustomerId: params.customerId,
        amount: toDecimal(params.amount),
        paymentMode: params.paymentMode,
        referenceNumber: params.referenceNumber,
        paidAt: new Date(),
    }

    return prisma.zohoBillingPayment.upsert({
        where: { zohoPaymentId: params.paymentId },
        create: { zohoPaymentId: params.paymentId, ...data },
        update: data,
    })
}

// A new subscription raises its first invoice immediately, but the id is not always on the
// subscription payload, so fall back to looking it up.
const findSubscriptionInvoice = async (subscription: TZohoSubscription) => {
    const invoiceId = subscription.invoice_id ?? subscription.child_invoice_id

    if (invoiceId) return getZohoBillingInvoice(invoiceId)

    const invoices = await listZohoBillingInvoices({
        subscription_id: subscription.subscription_id,
    })

    return invoices[0] ? getZohoBillingInvoice(invoices[0].invoice_id) : undefined
}

// Draft invoices are not payable, so open one before asking Zoho for a payment page.
export const preparePayment = async (invoiceId: string, userId?: string | null) => {
    let invoice = await getZohoBillingInvoice(invoiceId)

    if (invoice.status === 'draft') {
        await convertInvoiceToOpen(invoiceId)
        invoice = await getZohoBillingInvoice(invoiceId)
    }

    const mirrored = await mirrorInvoice(invoice, userId)

    // A settled invoice has nothing to pay; hand back the record instead of a payment page.
    if (invoice.balance <= 0) {
        return {
            zohoInvoiceId: invoice.invoice_id,
            invoiceNumber: mirrored.invoiceNumber,
            status: invoice.status,
            balance: invoice.balance,
            paymentUrl: null,
        }
    }

    const hostedPage = await createInvoicePaymentPage(invoice.invoice_id, getInvoiceReturnUrl())

    return {
        zohoInvoiceId: invoice.invoice_id,
        invoiceNumber: mirrored.invoiceNumber,
        status: invoice.status,
        balance: invoice.balance,
        paymentUrl: hostedPage.url,
    }
}

export type TSubscribePayload = {
    userId: string
    planCode: string
    price?: number
    quantity?: number
    reference?: string
}

// Subscribes a user to a plan that already exists in Zoho Billing and returns the URL where
// they pay the first invoice.
export const subscribeAndGetPaymentUrl = async (payload: Partial<TSubscribePayload>) => {
    const { userId, planCode, price, quantity, reference } = payload ?? {}

    if (typeof userId !== 'string' || !userId) throw new Error('userId is required')
    if (typeof planCode !== 'string' || !planCode.trim()) throw new Error('planCode is required')
    if (price !== undefined && (typeof price !== 'number' || !(price > 0))) {
        throw new Error('price must be a positive number when provided')
    }

    const plan = await getZohoPlan(planCode.trim())

    if (!plan) {
        throw new Error(
            `Plan "${planCode}" was not found in Zoho Billing. Use the plan_code exactly as it appears in the Zoho console.`,
        )
    }

    const customerId = await getOrCreateZohoBillingCustomer(userId)

    const subscription = await createZohoSubscription({
        customerId,
        planCode: plan.plan_code,
        price,
        quantity,
        referenceId: reference,
    })

    await mirrorSubscription(subscription, userId)

    const invoice = await findSubscriptionInvoice(subscription)

    if (!invoice) {
        return {
            zohoCustomerId: customerId,
            planCode: plan.plan_code,
            zohoSubscriptionId: subscription.subscription_id,
            subscriptionStatus: subscription.status,
            zohoInvoiceId: null,
            paymentUrl: null,
            message: 'Subscription created, but no invoice was raised for this cycle yet.',
        }
    }

    const payable = await preparePayment(invoice.invoice_id, userId)

    return {
        zohoCustomerId: customerId,
        planCode: plan.plan_code,
        zohoSubscriptionId: subscription.subscription_id,
        subscriptionStatus: subscription.status,
        zohoInvoiceId: payable.zohoInvoiceId,
        invoiceNumber: payable.invoiceNumber,
        invoiceStatus: payable.status,
        amountDue: payable.balance,
        paymentUrl: payable.paymentUrl,
    }
}

export const listMirroredInvoices = async (userId?: string) =>
    prisma.zohoBillingInvoice.findMany({
        where: userId ? { userId } : undefined,
        orderBy: { createdAt: 'desc' },
        include: { payments: true },
    })
