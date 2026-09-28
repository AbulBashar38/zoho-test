import { prisma } from '../../../app/lib/prisma'
import { Prisma } from '../../../generated/prisma/client'
import {
    getOrCreateZohoContact,
    getOrCreateZohoContactByDetails,
} from '../zoho-contact'
import {
    createZohoInvoiceWithLineItems,
    markZohoInvoiceAsSent,
    type TZohoBooksLineItem,
} from '../zoho-invoice'
import { createZohoCustomerPayment } from '../zoho-payment'

export type TBooksOrderItemInput = {
    type?: string
    description: string
    quantity?: number
    unitPrice: number
    // Optional Books catalogue item for this line.
    itemId?: string
}

export type TRecordPaidOrderPayload = {
    orderNumber: string
    items: TBooksOrderItemInput[]
    // The payer: a local user, an existing Books contact, or details to create one with.
    userId?: string
    zohoContactId?: string
    customer?: { name: string; email: string; phone?: string }
    payment?: {
        // Razorpay payment id or any gateway reference.
        reference?: string
        // A mode the organization accepts: cash, check, creditcard, banktransfer,
        // bankremittance, autotransaction, others, or a custom one.
        mode?: string
        // yyyy-mm-dd. Defaults to the invoice date.
        date?: string
        // Defaults to the invoice total; pass it only to record a part payment.
        amount?: number
    }
    description?: string
    notes?: string
}

const toDecimal = (value: number) => new Prisma.Decimal(value.toFixed(2))

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0

const validate = (payload: Partial<TRecordPaidOrderPayload>) => {
    const { orderNumber, items, userId, zohoContactId, customer, payment, description, notes } =
        payload ?? {}

    if (typeof orderNumber !== 'string' || !orderNumber.trim()) {
        throw new Error('orderNumber is required')
    }

    if (!userId && !zohoContactId && !customer) {
        throw new Error('Identify the customer with userId, zohoContactId, or customer details')
    }

    if (customer && (!customer.name?.trim() || !customer.email?.trim())) {
        throw new Error('customer.name and customer.email are required when customer is given')
    }

    if (!Array.isArray(items) || !items.length) {
        throw new Error('items[] is required')
    }

    const validatedItems = items.map((item, index) => {
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
            type: item.type?.trim() || 'ITEM',
            description: item.description.trim(),
            quantity,
            unitPrice: item.unitPrice,
            itemId: item.itemId?.trim(),
        }
    })

    if (payment?.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(payment.date)) {
        throw new Error('payment.date must be a date in yyyy-mm-dd format')
    }

    if (payment?.amount !== undefined && !isPositiveNumber(payment.amount)) {
        throw new Error('payment.amount must be a positive number when provided')
    }

    // The order total is calculated here, never taken from the caller.
    const total = Number(
        validatedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0).toFixed(2),
    )

    if (total <= 0) throw new Error('Order total must be greater than zero')

    return {
        orderNumber: orderNumber.trim(),
        items: validatedItems,
        total,
        userId,
        zohoContactId: zohoContactId?.trim(),
        customer,
        payment,
        description: description?.trim(),
        notes: notes?.trim(),
    }
}

type TOrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>

const serialize = (order: TOrderRow) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    description: order.description,
    totalAmount: order.totalAmount.toString(),
    status: order.status,
    zohoContactId: order.zohoCustomerId,
    zohoInvoiceId: order.zohoInvoiceId,
    invoiceNumber: order.invoiceNumber,
    zohoPaymentId: order.zohoPaymentId,
    paymentReference: order.paymentReference,
    paymentMode: order.paymentMode,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
        type: item.type,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        total: item.total.toString(),
    })),
})

const resolveContactId = async (params: {
    userId?: string
    zohoContactId?: string
    customer?: { name: string; email: string; phone?: string }
}) => {
    if (params.zohoContactId) return params.zohoContactId

    if (params.userId) return getOrCreateZohoContact(params.userId)

    const customer = params.customer as { name: string; email: string; phone?: string }

    return getOrCreateZohoContactByDetails({
        name: customer.name.trim(),
        email: customer.email.trim(),
        phone: customer.phone,
    })
}

// Records an order that has already been paid elsewhere (Razorpay) into Zoho Books:
// contact → invoice with the order's lines → mark sent → payment applied, leaving the
// invoice settled. Zoho holds the accounting record; no money moves here.
export const recordPaidOrderInBooks = async (payload: Partial<TRecordPaidOrderPayload>) => {
    const { orderNumber, items, total, userId, zohoContactId, customer, payment, description, notes } =
        validate(payload)

    // Calling twice for the same order — a retried webhook, say — must not invoice twice.
    const existing = await prisma.order.findUnique({
        where: { orderNumber },
        include: { items: true },
    })

    if (existing?.zohoInvoiceId) {
        console.log(`order ${orderNumber}: already recorded as invoice ${existing.zohoInvoiceId}`)

        return { alreadyRecorded: true, order: serialize(existing) }
    }

    const contactId = await resolveContactId({ userId, zohoContactId, customer })

    const lineItems: TZohoBooksLineItem[] = items.map((item) => ({
        name: item.description,
        description: item.description,
        rate: item.unitPrice,
        quantity: item.quantity,
        itemId: item.itemId,
    }))

    const invoice = await createZohoInvoiceWithLineItems({
        customerId: contactId,
        lineItems,
        referenceNumber: orderNumber,
        notes: notes ?? description,
    })

    console.log(
        `order ${orderNumber}: Books invoice ${invoice.invoice_id} (${invoice.invoice_number}) created`,
    )

    // A draft invoice cannot take a payment, so issue it first.
    if (invoice.status === 'draft') {
        await markZohoInvoiceAsSent(invoice.invoice_id)
    }

    // Record what the gateway already collected. Defaults to the invoice total so Zoho
    // includes any tax it applied, leaving the balance at zero.
    const paidAmount = payment?.amount ?? invoice.total

    const recordedPayment = await createZohoCustomerPayment({
        customerId: contactId,
        invoiceId: invoice.invoice_id,
        amount: paidAmount,
        date: payment?.date ?? invoice.date,
        paymentMode: payment?.mode ?? 'others',
        referenceNumber: payment?.reference,
    })

    console.log(
        `order ${orderNumber}: Books payment ${recordedPayment.payment_id} applied (${paidAmount})`,
    )

    const data = {
        description: description ?? `Order ${orderNumber}`,
        totalAmount: toDecimal(total),
        status: 'PAID' as const,
        zohoService: 'BOOKS',
        zohoCustomerId: contactId,
        zohoInvoiceId: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number,
        zohoPaymentId: recordedPayment.payment_id,
        paymentReference: payment?.reference,
        paymentMode: payment?.mode ?? 'others',
        paidAt: new Date(),
        ...(userId ? { userId } : {}),
    }

    const order = existing
        ? await prisma.order.update({
              where: { id: existing.id },
              data,
              include: { items: true },
          })
        : await prisma.order.create({
              data: {
                  ...data,
                  orderNumber,
                  items: {
                      create: items.map((item) => ({
                          type: item.type,
                          description: item.description,
                          quantity: toDecimal(item.quantity),
                          unitPrice: toDecimal(item.unitPrice),
                          total: toDecimal(item.quantity * item.unitPrice),
                      })),
                  },
              },
              include: { items: true },
          })

    return { alreadyRecorded: false, order: serialize(order) }
}

export const getBooksOrderByNumber = async (orderNumber: string) => {
    const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: { items: true },
    })

    if (!order) throw new Error(`Order not found: ${orderNumber}`)

    return serialize(order)
}
