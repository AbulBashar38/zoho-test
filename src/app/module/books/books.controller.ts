import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    getBooksOrderByNumber,
    recordPaidOrderInBooks,
} from '../../../integrations/zoho/books/books-order.service'
import { catchAsync } from '../../utils/catchAsync'
import { sendResponse } from '../../utils/sendResponse'

// Call this once Razorpay confirms the payment. It writes the accounting record into Zoho
// Books: contact, invoice with line items, and the payment applied against it.
const recordOrder = catchAsync(async (req: Request, res: Response) => {
    const { alreadyRecorded, order } = await recordPaidOrderInBooks(req.body)

    sendResponse(res, {
        statusCode: alreadyRecorded ? httpStatus.OK : httpStatus.CREATED,
        success: true,
        message: alreadyRecorded
            ? 'Order was already recorded in Zoho Books'
            : 'Order recorded in Zoho Books and marked paid',
        data: order,
    })
})

const getOrder = catchAsync(async (req: Request, res: Response) => {
    const result = await getBooksOrderByNumber(req.params.orderNumber as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Order fetched',
        data: result,
    })
})

export const BooksController = {
    recordOrder,
    getOrder,
}
