import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    cancelOrder,
    createOrderWithInvoice,
    createOrderWithPaymentLink,
    getOrder,
    getOrderByNumber,
    issueInvoiceForExistingOrder,
    listOrders,
    syncOrder,
} from '../../../integrations/zoho/billing/order.service'
import { catchAsync } from '../../utils/catchAsync'
import { sendResponse } from '../../utils/sendResponse'

// This backend prices the order; Zoho only collects the total.
const createWithLink = catchAsync(async (req: Request, res: Response) => {
    const result = await createOrderWithPaymentLink(req.body)

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Order created. Send the user to paymentUrl.',
        data: result,
    })
})

// Same contract, collected through a one-off Zoho invoice instead of a payment link.
const createWithInvoice = catchAsync(async (req: Request, res: Response) => {
    const result = await createOrderWithInvoice(req.body)

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Order created. Send the user to paymentUrl.',
        data: result,
    })
})

// Completes an order whose Zoho invoice failed to be created, or refreshes its checkout page.
const issueInvoice = catchAsync(async (req: Request, res: Response) => {
    const result = await issueInvoiceForExistingOrder(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invoice ready. Send the user to paymentUrl.',
        data: result,
    })
})

const getOne = catchAsync(async (req: Request, res: Response) => {
    // ?sync=true re-checks Zoho instead of trusting the stored status.
    const result =
        req.query.sync === 'true'
            ? await syncOrder(req.params.id as string)
            : await getOrder(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Order fetched',
        data: result,
    })
})

const getByNumber = catchAsync(async (req: Request, res: Response) => {
    const result = await getOrderByNumber(req.params.orderNumber as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Order fetched',
        data: result,
    })
})

const sync = catchAsync(async (req: Request, res: Response) => {
    const result = await syncOrder(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Order synced with Zoho',
        data: result,
    })
})

const cancel = catchAsync(async (req: Request, res: Response) => {
    const result = await cancelOrder(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Order cancelled',
        data: result,
    })
})

const list = catchAsync(async (req: Request, res: Response) => {
    const result = await listOrders({
        userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
    })

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Orders fetched',
        data: result,
    })
})

export const OrderController = {
    createWithLink,
    createWithInvoice,
    issueInvoice,
    getOne,
    getByNumber,
    sync,
    cancel,
    list,
}
