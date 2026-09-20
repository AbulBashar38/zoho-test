import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    listMirroredInvoices,
    preparePayment,
    subscribeAndGetPaymentUrl,
} from '../../../integrations/zoho/billing/zoho-billing.service'
import {
    getZohoBillingItem,
    getZohoBillingItemIdByName,
    listZohoBillingItems,
} from '../../../integrations/zoho/billing/zoho-billing-item'
import {
    getZohoProduct,
    getZohoProductIdByName,
    listAllZohoProducts,
} from '../../../integrations/zoho/billing/zoho-billing-product'
import { handleZohoBillingWebhook } from '../../../integrations/zoho/billing/zoho-billing-webhook'
import config from '../../config'
import { catchAsync } from '../../utils/catchAsync'
import { sendResponse } from '../../utils/sendResponse'

// Subscribe a user to an existing Zoho plan and hand back the URL where they pay.
const subscribe = catchAsync(async (req: Request, res: Response) => {
    const result = await subscribeAndGetPaymentUrl(req.body)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.paymentUrl
            ? 'Subscription created. Redirect the user to paymentUrl.'
            : 'Subscription created.',
        data: result,
    })
})

// Payment URL for an invoice that already exists, e.g. a later monthly invoice.
const payInvoice = catchAsync(async (req: Request, res: Response) => {
    const result = await preparePayment(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.paymentUrl ? 'Payment page ready' : 'Invoice has no outstanding balance',
        data: result,
    })
})

// Where Zoho returns the user after payment. The redirect is never trusted as proof —
// the webhook decides.
const paymentReturn = catchAsync(async (_req: Request, res: Response) => {
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Checking payment status. This page updates once Zoho confirms the payment.',
        data: { status: 'checking' },
    })
})

// Zoho calls this; it is what actually updates the database.
const webhook = catchAsync(async (req: Request, res: Response) => {
    // Logged before anything else, so a delivery that fails the secret check is still
    // visible in the terminal.
    console.log('\n──────── ZOHO WEBHOOK RECEIVED ────────')
    console.log('time      :', new Date().toISOString())
    console.log('from      :', req.ip)
    console.log('query     :', {
        ...req.query,
        secret: req.query.secret ? '<provided>' : undefined,
    })
    console.log('body      :', JSON.stringify(req.body, null, 2))

    // Zoho does not sign these callbacks, so the URL carries a shared secret.
    if (config.zoho.webhook_secret) {
        const provided = req.query.secret ?? req.headers['x-zoho-webhook-secret']

        if (provided !== config.zoho.webhook_secret) {
            console.log('result    : REJECTED — secret did not match ZOHO_WEBHOOK_SECRET')
            console.log('───────────────────────────────────────\n')

            sendResponse(res, {
                statusCode: httpStatus.UNAUTHORIZED,
                success: false,
                message: 'Invalid webhook secret',
                data: null,
            })
            return
        }
    }

    try {
        const result = await handleZohoBillingWebhook(
            req.body,
            typeof req.query.event_type === 'string' ? req.query.event_type : undefined,
        )

        console.log(
            'result    :',
            result.duplicate
                ? `DUPLICATE — "${result.eventType}" was already processed`
                : `OK — handled "${result.eventType}"`,
        )
        console.log('───────────────────────────────────────\n')

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: result.duplicate ? 'Event already processed' : 'Webhook processed',
            data: result,
        })
    } catch (error) {
        console.log('result    : FAILED —', (error as Error).message)
        console.log('───────────────────────────────────────\n')
        throw error
    }
})

// Looks an item up in Zoho. ?name= returns the single exact match (with its item_id),
// ?search= or no filter returns the list.
const findItems = catchAsync(async (req: Request, res: Response) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : undefined
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined

    if (name) {
        const item = await getZohoBillingItemIdByName(name)

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Item found',
            data: item,
        })
        return
    }

    const items = await listZohoBillingItems(search ? { search_text: search } : {})

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Items fetched from Zoho',
        data: items,
    })
})

const getItem = catchAsync(async (req: Request, res: Response) => {
    const result = await getZohoBillingItem(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Item fetched from Zoho',
        data: result,
    })
})

// Looks a product up in Zoho. ?name= returns the single exact match (with its product_id),
// otherwise the full list.
const findProducts = catchAsync(async (req: Request, res: Response) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : undefined

    if (name) {
        const product = await getZohoProductIdByName(name)

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Product found',
            data: product,
        })
        return
    }

    const products = await listAllZohoProducts()

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Products fetched from Zoho',
        data: products,
    })
})

const getProduct = catchAsync(async (req: Request, res: Response) => {
    const result = await getZohoProduct(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Product fetched from Zoho',
        data: result,
    })
})

// Served from the local mirror, so you can see what the webhook stored.
const listInvoices = catchAsync(async (req: Request, res: Response) => {
    const result = await listMirroredInvoices(
        typeof req.query.userId === 'string' ? req.query.userId : undefined,
    )

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invoices fetched from the local mirror',
        data: result,
    })
})

export const BillingController = {
    subscribe,
    findItems,
    getItem,
    findProducts,
    getProduct,
    payInvoice,
    paymentReturn,
    webhook,
    listInvoices,
}
