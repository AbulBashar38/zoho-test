import { prisma } from '../../../app/lib/prisma'
import { Prisma } from '../../../generated/prisma/client'
import { getOrCreateZohoBillingCustomer } from './zoho-billing-customer'
import {
    convertInvoiceToOpen,
    createAdhocZohoInvoice,
    createInvoicePaymentPage,
    getInvoiceReturnUrl,
    getZohoBillingInvoice,
} from './zoho-billing-invoice'
import {
    cancelZohoPaymentLink,
    createZohoPaymentLink,
    getZohoPaymentLink,
    readPaymentLinkStatus,
    type TZohoPaymentLink,
} from './zoho-payment-link'

export type TCreatePaymentRequestPayload = {
    // Either identifies the payer: userId is resolved to a Zoho customer, or pass the
    // Zoho customer id directly.
    userId?: string
    zohoCustomerId?: string
    amount: number
    description: string
    reference?: string
    expiryTime?: string
}

const toDecimal = (value: number) => new Prisma.Decimal(value)

const validate = (payload: Partial<TCreatePaymentRequestPayload>) => {
    const { userId, zohoCustomerId, amount, description, reference, expiryTime } = payload ?? {}

    if (!userId && !zohoCustomerId) {
        throw new Error('Either userId or zohoCustomerId is required')
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('amount must be a positive number')
    }

    if (typeof description !== 'string' || !description.trim()) {
        throw new Error('description is required')
    }

    if (reference !== undefined && (typeof reference !== 'string' || !reference.trim())) {
        throw new Error('reference must be a non-empty string when provided')
    }

    return {
        userId,
        zohoCustomerId,
        amount,
        description: description.trim(),
        reference: reference?.trim(),
        expiryTime,
    }
}

const serialize = (request: {
    id: string
    reference: string
    description: string
    amount: Prisma.Decimal
    status: string
    paymentUrl: string | null
    zohoPaymentLinkId: string | null
    paymentLinkNumber: string | null
    zohoInvoiceId: string | null
    zohoCustomerId: string
    zohoPaymentId: string | null
    expiresAt: Date | null
    paidAt: Date | null
    createdAt: Date
}) => ({
    id: request.id,
    reference: request.reference,
    description: request.description,
    amount: request.amount.toString(),
    status: request.status,
    paymentUrl: request.paymentUrl,
    zohoPaymentLinkId: request.zohoPaymentLinkId,
    paymentLinkNumber: request.paymentLinkNumber,
    zohoInvoiceId: request.zohoInvoiceId,
    zohoCustomerId: request.zohoCustomerId,
    zohoPaymentId: request.zohoPaymentId,
    expiresAt: request.expiresAt,
    paidAt: request.paidAt,
    createdAt: request.createdAt,
})

// Creates the Zoho payment link and the local record that tracks it.
export const createPaymentRequest = async (payload: Partial<TCreatePaymentRequestPayload>) => {
    const { userId, zohoCustomerId, amount, description, reference, expiryTime } = validate(payload)

    const customerId = zohoCustomerId ?? (await getOrCreateZohoBillingCustomer(userId as string))

    // Your own reference identifies the order; one is generated when you do not supply it.
    const paymentReference = reference ?? `PAY-${Date.now()}`

    const duplicate = await prisma.paymentRequest.findUnique({
        where: { reference: paymentReference },
        select: { id: true },
    })

    if (duplicate) {
        throw new Error(`A payment request with reference "${paymentReference}" already exists`)
    }

    const link = await createZohoPaymentLink({
        customerId,
        amount,
        description,
        expiryTime,
    })

    const request = await prisma.paymentRequest.create({
        data: {
            reference: paymentReference,
            description,
            amount: toDecimal(amount),
            zohoCustomerId: customerId,
            zohoPaymentLinkId: link.payment_link_id,
            paymentLinkNumber: link.payment_link_number,
            paymentUrl: link.url,
            status: readPaymentLinkStatus(link.status),
            expiresAt: link.expiry_time ? new Date(link.expiry_time) : null,
            ...(userId ? { userId } : {}),
        },
    })

    return serialize(request)
}

// Same contract as createPaymentRequest, but collects through a one-off Zoho invoice and
// its hosted payment page. Use it when the Payment Links feature is unavailable.
export const createInvoicePaymentRequest = async (
    payload: Partial<TCreatePaymentRequestPayload>,
) => {
    const { userId, zohoCustomerId, amount, description, reference } = validate(payload)

    const customerId = zohoCustomerId ?? (await getOrCreateZohoBillingCustomer(userId as string))
    const paymentReference = reference ?? `PAY-${Date.now()}`

    const duplicate = await prisma.paymentRequest.findUnique({
        where: { reference: paymentReference },
        select: { id: true },
    })

    if (duplicate) {
        throw new Error(`A payment request with reference "${paymentReference}" already exists`)
    }

    const invoice = await createAdhocZohoInvoice({
        customerId,
        amount,
        description,
        referenceNumber: paymentReference,
    })

    // Draft invoices cannot be paid, so open it before generating the payment page.
    if (invoice.status === 'draft') {
        await convertInvoiceToOpen(invoice.invoice_id)
    }

    const hostedPage = await createInvoicePaymentPage(invoice.invoice_id, getInvoiceReturnUrl())

    const request = await prisma.paymentRequest.create({
        data: {
            reference: paymentReference,
            description,
            amount: toDecimal(amount),
            currencyCode: invoice.currency_code,
            zohoCustomerId: customerId,
            zohoInvoiceId: invoice.invoice_id,
            paymentUrl: hostedPage.url,
            status: 'PENDING',
            ...(userId ? { userId } : {}),
        },
    })

    return serialize(request)
}

// Called from the webhook when a payment settles an invoice this table is tracking.
export const markPaymentRequestPaidByInvoice = async (invoiceId: string, paymentId?: string) => {
    const request = await prisma.paymentRequest.findUnique({
        where: { zohoInvoiceId: invoiceId },
        select: { id: true, reference: true, status: true },
    })

    if (!request || request.status === 'PAID') return null

    await prisma.paymentRequest.update({
        where: { id: request.id },
        data: {
            status: 'PAID',
            paidAt: new Date(),
            ...(paymentId ? { zohoPaymentId: paymentId } : {}),
        },
    })

    console.log(`  payment request ${request.reference} -> PAID (invoice ${invoiceId})`)

    return request.reference
}

const applyLinkStatus = async (
    requestId: string,
    link: TZohoPaymentLink,
    zohoPaymentId?: string,
) => {
    const status = readPaymentLinkStatus(link.status)

    const updated = await prisma.paymentRequest.update({
        where: { id: requestId },
        data: {
            status,
            paymentUrl: link.url,
            paymentLinkNumber: link.payment_link_number,
            paidAt: status === 'PAID' ? new Date() : null,
            ...(zohoPaymentId ? { zohoPaymentId } : {}),
        },
    })

    return updated
}

// Re-reads the link from Zoho; Zoho is the authority on whether money arrived.
export const syncPaymentRequest = async (id: string) => {
    const request = await prisma.paymentRequest.findUnique({ where: { id } })

    if (!request) throw new Error(`Payment request not found: ${id}`)

    // Invoice-backed request: the invoice balance says whether it is settled.
    if (request.zohoInvoiceId) {
        const invoice = await getZohoBillingInvoice(request.zohoInvoiceId)
        const isPaid = invoice.status === 'paid' || invoice.balance <= 0

        if (isPaid && request.status !== 'PAID') {
            await markPaymentRequestPaidByInvoice(request.zohoInvoiceId)
        }

        const refreshed = await prisma.paymentRequest.findUnique({ where: { id: request.id } })

        return serialize(refreshed ?? request)
    }

    if (!request.zohoPaymentLinkId) {
        return serialize(request)
    }

    const link = await getZohoPaymentLink(request.zohoPaymentLinkId)

    return serialize(await applyLinkStatus(request.id, link))
}

export const cancelPaymentRequest = async (id: string) => {
    const request = await prisma.paymentRequest.findUnique({ where: { id } })

    if (!request) throw new Error(`Payment request not found: ${id}`)
    if (request.status === 'PAID') throw new Error('A paid payment request cannot be cancelled')

    if (request.zohoPaymentLinkId) {
        await cancelZohoPaymentLink(request.zohoPaymentLinkId)
    }

    const updated = await prisma.paymentRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED' },
    })

    return serialize(updated)
}

export const getPaymentRequest = async (id: string) => {
    const request = await prisma.paymentRequest.findUnique({ where: { id } })

    if (!request) throw new Error(`Payment request not found: ${id}`)

    return serialize(request)
}

export const getPaymentRequestByReference = async (reference: string) => {
    const request = await prisma.paymentRequest.findUnique({ where: { reference } })

    if (!request) throw new Error(`Payment request not found for reference: ${reference}`)

    return serialize(request)
}

export const listPaymentRequests = async (filters: { userId?: string; status?: string }) => {
    const requests = await prisma.paymentRequest.findMany({
        where: {
            ...(filters.userId ? { userId: filters.userId } : {}),
            ...(filters.status
                ? { status: filters.status as Prisma.EnumPaymentRequestStatusFilter['equals'] }
                : {}),
        },
        orderBy: { createdAt: 'desc' },
    })

    return requests.map(serialize)
}

// Called from the webhook: re-checks every pending link for the paying customer and marks
// the settled one PAID. Each link's status comes from Zoho rather than the webhook body,
// so a mismatched amount can never flip the wrong record.
export const reconcilePaymentLinksForCustomer = async (params: {
    customerId: string
    paymentId?: string
    amount?: number
}) => {
    const pending = await prisma.paymentRequest.findMany({
        where: {
            zohoCustomerId: params.customerId,
            status: 'PENDING',
            zohoPaymentLinkId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
    })

    const settled: string[] = []
    // Links Zoho still reports as unpaid, but whose amount matches the payment: the status
    // may simply not have caught up yet, so the caller can ask Zoho to retry.
    const awaitingStatus: string[] = []

    for (const request of pending) {
        const link = await getZohoPaymentLink(request.zohoPaymentLinkId as string)
        const status = readPaymentLinkStatus(link.status)

        if (status === 'PENDING') {
            if (
                params.amount !== undefined &&
                request.amount.equals(new Prisma.Decimal(params.amount))
            ) {
                awaitingStatus.push(request.reference)
            }
            continue
        }

        // Only attribute the payment id when the amounts agree.
        const amountMatches =
            params.amount === undefined || request.amount.equals(new Prisma.Decimal(params.amount))

        await applyLinkStatus(
            request.id,
            link,
            status === 'PAID' && amountMatches ? params.paymentId : undefined,
        )

        if (status === 'PAID') {
            settled.push(request.reference)
            console.log(
                `  payment request ${request.reference} -> PAID (link ${request.zohoPaymentLinkId}, Zoho status "${link.status}")`,
            )
        }
    }

    return { settled, awaitingStatus }
}
