import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import { authorizeZohoIntegration } from '../../../integrations/zoho/zoho-auth'
import { runZohoOrganizationsTest, runZohoTest } from '../../../integrations/zoho/zoho-test.service'
import { catchAsync } from '../../utils/catchAsync'
import { sendResponse } from '../../utils/sendResponse'

// Zoho redirects the browser here after the user approves the connection.
const oauthCallback = catchAsync(async (req: Request, res: Response) => {
    const { code, error, error_description: errorDescription } = req.query

    // Zoho reports a declined or failed authorization as ?error=access_denied
    if (typeof error === 'string' && error) {
        sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: `Zoho authorization failed: ${error}${typeof errorDescription === 'string' && errorDescription ? ` (${errorDescription})` : ''}`,
            data: null,
        })
        return
    }

    if (typeof code !== 'string' || !code.trim()) {
        sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'code query parameter is required',
            data: null,
        })
        return
    }

    const result = await authorizeZohoIntegration({ code })

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Zoho authorization successful. You can close this tab.',
        data: result,
    })
})

// Same exchange, for a code pasted in by hand (Zoho Self Client).
const authorize = catchAsync(async (req: Request, res: Response) => {
    const result = await authorizeZohoIntegration(req.body)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Zoho integration authorized and refresh token stored',
        data: result,
    })
})

const testConnection = catchAsync(async (_req: Request, res: Response) => {
    const result = await runZohoOrganizationsTest()

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Zoho Books connection is working',
        data: result,
    })
})

const runIntegrationTest = catchAsync(async (req: Request, res: Response) => {
    const result = await runZohoTest(req.body)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Zoho Books integration test completed',
        data: result,
    })
})

export const ZohoController = {
    oauthCallback,
    authorize,
    testConnection,
    runIntegrationTest,
}
