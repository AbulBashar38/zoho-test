import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    listMirroredInvoices,
    preparePayment,
    subscribeAndGetPaymentUrl,
} from '../../../integrations/zoho/billing/zoho-billing.service'
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
    // Zoho does not sign these callbacks, so the URL carries a shared secret.
    if (config.zoho.webhook_secret) {
        const provided = req.query.secret ?? req.headers['x-zoho-webhook-secret']

        if (provided !== config.zoho.webhook_secret) {
            sendResponse(res, {
                statusCode: httpStatus.UNAUTHORIZED,
                success: false,
                message: 'Invalid webhook secret',
                data: null,
            })
            return
        }
    }

    const result = await handleZohoBillingWebhook(
        req.body,
        typeof req.query.event_type === 'string' ? req.query.event_type : undefined,
    )

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.duplicate ? 'Event already processed' : 'Webhook processed',
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
    payInvoice,
    paymentReturn,
    webhook,
    listInvoices,
}
