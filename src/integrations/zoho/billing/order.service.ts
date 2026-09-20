import { prisma } from '../../../app/lib/prisma'
import { Prisma } from '../../../generated/prisma/client'
import { getOrCreateZohoBillingCustomer } from './zoho-billing-customer'
import {
    convertInvoiceToOpen,
    createInvoicePaymentPage,
    createZohoInvoiceWithItems,
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

export type TOrderItemInput = {
    type?: string
    description: string
    quantity?: number
    unitPrice: number
    // Optional Zoho catalogue product for this line.
    productId?: string
}

export type TCreateOrderPayload = {
    // Either identifies the payer: userId is resolved to a Zoho customer, or pass the Zoho
    // customer id directly.
    userId?: string
    zohoCustomerId?: string
    // Preferred: the breakdown, whose total this backend calculates.
    items?: TOrderItemInput[]
    // Shorthand for a single-line order.
    amount?: number
    description?: string
    orderNumber?: string
    expiryTime?: string
}

const toDecimal = (value: number) => new Prisma.Decimal(value.toFixed(2))

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0

type TValidatedItem = {
    type: string
    description: string
    quantity: number
    unitPrice: number
    productId?: string
}

// Accepts either a full breakdown or a single amount, and always returns priced lines.
const validate = (payload: Partial<TCreateOrderPayload>) => {
    const { userId, zohoCustomerId, items, amount, description, orderNumber, expiryTime } =
        payload ?? {}

    if (!userId && !zohoCustomerId) {
        throw new Error('Either userId or zohoCustomerId is required')
    }

    if (orderNumber !== undefined && (typeof orderNumber !== 'string' || !orderNumber.trim())) {
        throw new Error('orderNumber must be a non-empty string when provided')
    }

    let validatedItems: TValidatedItem[]

    if (Array.isArray(items) && items.length) {
        validatedItems = items.map((item, index) => {
            if (typeof item?.description !== 'string' || !item.description.trim()) {
                throw new Error(`items[${index}].description is required`)
            }

            if (!isPositiveNumber(item.unitPrice)) {
                throw new Error(`items[${index}].unitPrice must be a positive number`)
            }

            const quantity = item.quantity ?? 1

            if (!isPositiveNumber(quantity)) {
                throw new Error(`items[${index}].quantity must be a positive number`)
            }

            return {
                type: typeof item.type === 'string' && item.type.trim() ? item.type.trim() : 'ITEM',
                description: item.description.trim(),
                quantity,
                unitPrice: item.unitPrice,
                ...(typeof item.productId === 'string' && item.productId.trim()
                    ? { productId: item.productId.trim() }
                    : {}),
            }
        })
    } else if (isPositiveNumber(amount)) {
        if (typeof description !== 'string' || !description.trim()) {
            throw new Error('description is required when no items are given')
        }

        validatedItems = [
            { type: 'ITEM', description: description.trim(), quantity: 1, unitPrice: amount },
        ]
    } else {
        throw new Error('Provide either items[] or a positive amount')
    }

    // The total is computed here; the caller never dictates it when items are supplied.
    const total = Number(
        validatedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0).toFixed(2),
    )

    if (total <= 0) throw new Error('Order total must be greater than zero')

    return {
        userId,
        zohoCustomerId,
        items: validatedItems,
        total,
        description: description?.trim(),
        orderNumber: orderNumber?.trim(),
        expiryTime,
    }
}

type TOrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>

const serialize = (order: TOrderRow) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    description: order.description,
    totalAmount: order.totalAmount.toString(),
    currencyCode: order.currencyCode,
    status: order.status,
    paymentUrl: order.paymentUrl,
    zohoPaymentLinkId: order.zohoPaymentLinkId,
    paymentLinkNumber: order.paymentLinkNumber,
    zohoInvoiceId: order.zohoInvoiceId,
    invoiceNumber: order.invoiceNumber,
    zohoCustomerId: order.zohoCustomerId,
    zohoPaymentId: order.zohoPaymentId,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
        id: item.id,
        type: item.type,
        description: item.description,
        zohoProductId: item.zohoProductId,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        total: item.total.toString(),
    })),
})

const findOrderOrThrow = async (id: string) => {
    const order = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
    })

    if (!order) throw new Error(`Order not found: ${id}`)

    return order
}

const assertUniqueOrderNumber = async (orderNumber: string) => {
    const duplicate = await prisma.order.findUnique({
        where: { orderNumber },
        select: { id: true },
    })

    if (duplicate) {
        throw new Error(`An order with orderNumber "${orderNumber}" already exists`)
    }
}

const buildOrderData = (params: {
    orderNumber: string
    description?: string
    total: number
    customerId: string
    userId?: string
    items: TValidatedItem[]
}) => ({
    orderNumber: params.orderNumber,
    description: params.description ?? `Order ${params.orderNumber}`,
    totalAmount: toDecimal(params.total),
    zohoCustomerId: params.customerId,
    ...(params.userId ? { userId: params.userId } : {}),
    items: {
        create: params.items.map((item) => ({
            type: item.type,
            description: item.description,
            zohoProductId: item.productId,
            quantity: toDecimal(item.quantity),
            unitPrice: toDecimal(item.unitPrice),
            total: toDecimal(item.quantity * item.unitPrice),
        })),
    },
})

// Order → Zoho payment link. No product, plan, subscription or invoice is involved.
export const createOrderWithPaymentLink = async (payload: Partial<TCreateOrderPayload>) => {
    const { userId, zohoCustomerId, items, total, description, orderNumber, expiryTime } =
        validate(payload)

    const customerId = zohoCustomerId ?? (await getOrCreateZohoBillingCustomer(userId as string))
    const number = orderNumber ?? `ORD-${Date.now()}`

    await assertUniqueOrderNumber(number)

    const link = await createZohoPaymentLink({
        customerId,
        amount: total,
        description: description ?? `Order ${number}`,
        expiryTime,
    })

    const order = await prisma.order.create({
        data: {
            ...buildOrderData({
                orderNumber: number,
                description,
                total,
                customerId,
                userId,
                items,
            }),
            zohoPaymentLinkId: link.payment_link_id,
            paymentLinkNumber: link.payment_link_number,
            paymentUrl: link.url,
            status: readPaymentLinkStatus(link.status),
            expiresAt: link.expiry_time ? new Date(link.expiry_time) : null,
        },
        include: { items: true },
    })

    return serialize(order)
}

// The main route: a one-time Zoho invoice carrying the order's own line items, paid on
// Zoho's hosted page so the payment is recorded against that invoice.
export const createOrderWithInvoice = async (payload: Partial<TCreateOrderPayload>) => {
    const { userId, zohoCustomerId, items, total, description, orderNumber } = validate(payload)

    const customerId = zohoCustomerId ?? (await getOrCreateZohoBillingCustomer(userId as string))
    const number = orderNumber ?? `ORD-${Date.now()}`

    await assertUniqueOrderNumber(number)

    // Every order line becomes an invoice line, priced exactly as calculated here.
    const invoice = await createZohoInvoiceWithItems({
        customerId,
        referenceNumber: number,
        notes: description,
        items: items.map((item) => ({
            name: item.description,
            description: item.description,
            price: item.unitPrice,
            quantity: item.quantity,
            productId: item.productId,
        })),
    })

    // Draft invoices cannot be paid, so open it before generating the payment page.
    let openInvoice = invoice

    if (invoice.status === 'draft') {
        await convertInvoiceToOpen(invoice.invoice_id)
        openInvoice = await getZohoBillingInvoice(invoice.invoice_id)
    }

    // Zoho's own invoice URL is preferred; the hosted page is the fallback when the
    // invoice response carries no shareable link.
    const invoiceUrl = openInvoice.invoice_url
    const paymentUrl =
        invoiceUrl ??
        (await createInvoicePaymentPage(invoice.invoice_id, getInvoiceReturnUrl())).url

    const order = await prisma.order.create({
        data: {
            ...buildOrderData({
                orderNumber: number,
                description,
                total,
                customerId,
                userId,
                items,
            }),
            currencyCode: openInvoice.currency_code,
            zohoInvoiceId: invoice.invoice_id,
            invoiceNumber: openInvoice.number ?? openInvoice.invoice_number,
            paymentUrl,
            status: 'PENDING',
        },
        include: { items: true },
    })

    return serialize(order)
}

const markPaid = async (orderId: string, paymentId?: string) =>
    prisma.order.update({
        where: { id: orderId },
        data: {
            status: 'PAID',
            paidAt: new Date(),
            ...(paymentId ? { zohoPaymentId: paymentId } : {}),
        },
        include: { items: true },
    })

const applyLinkStatus = async (orderId: string, link: TZohoPaymentLink, paymentId?: string) => {
    const status = readPaymentLinkStatus(link.status)

    return prisma.order.update({
        where: { id: orderId },
        data: {
            status,
            paymentUrl: link.url,
            paymentLinkNumber: link.payment_link_number,
            paidAt: status === 'PAID' ? new Date() : null,
            ...(paymentId ? { zohoPaymentId: paymentId } : {}),
        },
        include: { items: true },
    })
}

// Called from the webhook when a payment settles an invoice-backed order.
export const markOrderPaidByInvoice = async (invoiceId: string, paymentId?: string) => {
    const order = await prisma.order.findUnique({
        where: { zohoInvoiceId: invoiceId },
        select: { id: true, orderNumber: true, status: true },
    })

    if (!order || order.status === 'PAID') return null

    // Zoho decides whether the invoice is settled: a part payment leaves the order pending.
    const invoice = await getZohoBillingInvoice(invoiceId)

    if (invoice.status !== 'paid' && invoice.balance > 0) {
        console.log(
            `  order ${order.orderNumber} still PENDING (invoice ${invoiceId} balance ${invoice.balance})`,
        )
        return null
    }

    await markPaid(order.id, paymentId)
    console.log(`  order ${order.orderNumber} -> PAID (invoice ${invoiceId})`)

    return order.orderNumber
}

// Zoho is the authority on whether money arrived, so the status is always re-read from it.
export const syncOrder = async (id: string) => {
    const order = await findOrderOrThrow(id)

    if (order.zohoInvoiceId) {
        const invoice = await getZohoBillingInvoice(order.zohoInvoiceId)

        if ((invoice.status === 'paid' || invoice.balance <= 0) && order.status !== 'PAID') {
            return serialize(await markPaid(order.id))
        }

        return serialize(order)
    }

    if (!order.zohoPaymentLinkId) return serialize(order)

    const link = await getZohoPaymentLink(order.zohoPaymentLinkId)

    return serialize(await applyLinkStatus(order.id, link))
}

export const cancelOrder = async (id: string) => {
    const order = await findOrderOrThrow(id)

    if (order.status === 'PAID') throw new Error('A paid order cannot be cancelled')

    if (order.zohoPaymentLinkId) {
        await cancelZohoPaymentLink(order.zohoPaymentLinkId)
    }

    const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: { items: true },
    })

    return serialize(updated)
}

export const getOrder = async (id: string) => serialize(await findOrderOrThrow(id))

export const getOrderByNumber = async (orderNumber: string) => {
    const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: { items: true },
    })

    if (!order) throw new Error(`Order not found: ${orderNumber}`)

    return serialize(order)
}

export const listOrders = async (filters: { userId?: string; status?: string }) => {
    const orders = await prisma.order.findMany({
        where: {
            ...(filters.userId ? { userId: filters.userId } : {}),
            ...(filters.status ? { status: filters.status as TOrderRow['status'] } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
    })

    return orders.map(serialize)
}

// Called from the webhook: re-checks the paying customer's pending links and marks the
// settled order PAID. Each status comes from Zoho, never from the webhook body, so a
// coincidental amount can never flip the wrong order.
export const reconcileOrdersForCustomer = async (params: {
    customerId: string
    paymentId?: string
    amount?: number
}) => {
    const pending = await prisma.order.findMany({
        where: {
            zohoCustomerId: params.customerId,
            status: 'PENDING',
            zohoPaymentLinkId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
    })

    const settled: string[] = []
    // Links Zoho still reports unpaid whose total matches the payment: the status may not
    // have caught up, so the caller can ask Zoho to retry.
    const awaitingStatus: string[] = []

    for (const order of pending) {
        const link = await getZohoPaymentLink(order.zohoPaymentLinkId as string)
        const status = readPaymentLinkStatus(link.status)

        const amountMatches =
            params.amount === undefined ||
            order.totalAmount.equals(new Prisma.Decimal(params.amount))

        if (status === 'PENDING') {
            if (amountMatches && params.amount !== undefined) {
                awaitingStatus.push(order.orderNumber)
            }
            continue
        }

        await applyLinkStatus(
            order.id,
            link,
            status === 'PAID' && amountMatches ? params.paymentId : undefined,
        )

        if (status === 'PAID') {
            settled.push(order.orderNumber)
            console.log(
                `  order ${order.orderNumber} -> PAID (link ${order.zohoPaymentLinkId}, Zoho status "${link.status}")`,
            )
        }
    }

    return { settled, awaitingStatus }
}
