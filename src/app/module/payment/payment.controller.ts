import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    cancelPaymentRequest,
    createInvoicePaymentRequest,
    createPaymentRequest,
    getPaymentRequest,
    getPaymentRequestByReference,
    listPaymentRequests,
    syncPaymentRequest,
} from '../../../integrations/zoho/billing/payment-request.service'
import { catchAsync } from '../../utils/catchAsync'
import { sendResponse } from '../../utils/sendResponse'

// Your backend decides the amount; Zoho just collects it.
const createLink = catchAsync(async (req: Request, res: Response) => {
    const result = await createPaymentRequest(req.body)

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Payment link created. Send the user to paymentUrl.',
        data: result,
    })
})

// Fallback when the Payment Links feature is not enabled: collect through a one-off Zoho
// invoice and its hosted payment page. Same request and response shape as /links.
const createInvoiceLink = catchAsync(async (req: Request, res: Response) => {
    const result = await createInvoicePaymentRequest(req.body)

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Payment page created. Send the user to paymentUrl.',
        data: result,
    })
})

const getOne = catchAsync(async (req: Request, res: Response) => {
    // ?sync=true re-checks Zoho instead of trusting the stored status.
    const result =
        req.query.sync === 'true'
            ? await syncPaymentRequest(req.params.id as string)
            : await getPaymentRequest(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Payment request fetched',
        data: result,
    })
})

const getByReference = catchAsync(async (req: Request, res: Response) => {
    const result = await getPaymentRequestByReference(req.params.reference as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Payment request fetched',
        data: result,
    })
})

const sync = catchAsync(async (req: Request, res: Response) => {
    const result = await syncPaymentRequest(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Payment request synced with Zoho',
        data: result,
    })
})

const cancel = catchAsync(async (req: Request, res: Response) => {
    const result = await cancelPaymentRequest(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Payment link cancelled',
        data: result,
    })
})

const list = catchAsync(async (req: Request, res: Response) => {
    const result = await listPaymentRequests({
        userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
    })

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Payment requests fetched',
        data: result,
    })
})

export const PaymentController = {
    createLink,
    createInvoiceLink,
    getOne,
    getByReference,
    sync,
    cancel,
    list,
}
