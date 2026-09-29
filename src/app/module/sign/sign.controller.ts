import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    createAgreementFromTemplate,
    getAgreementStatus,
    sendAgreement,
} from '../../../integrations/zoho/sign/sign-agreement.service'
import {
    captureAgreement,
    getStoredAgreement,
    listStoredAgreements,
} from '../../../integrations/zoho/sign/sign-capture.service'
import { handleZohoSignWebhook } from '../../../integrations/zoho/sign/sign-webhook.service'
import {
    getZohoSignTemplate,
    getZohoSignTemplateByName,
    listZohoSignTemplates,
} from '../../../integrations/zoho/sign/zoho-sign-template'
import config from '../../config'
import { catchAsync } from '../../utils/catchAsync'
import { sendResponse } from '../../utils/sendResponse'

// ?name= returns the one exact match with its full details; ?search= or nothing lists them.
const listTemplates = catchAsync(async (req: Request, res: Response) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : undefined

    if (name) {
        const template = await getZohoSignTemplateByName(name)

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Template found',
            data: template,
        })
        return
    }

    const templates = await listZohoSignTemplates({
        searchText: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
        rowCount: req.query.rowCount ? Number(req.query.rowCount) : undefined,
        startIndex: req.query.startIndex ? Number(req.query.startIndex) : undefined,
    })

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Templates fetched from Zoho Sign',
        data: templates,
    })
})

// Full details: recipient actions and the field definitions needed to send a document.
const getTemplate = catchAsync(async (req: Request, res: Response) => {
    const result = await getZohoSignTemplate(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Template fetched from Zoho Sign',
        data: result,
    })
})

// Creates one agreement from an existing template: admin values pre-filled, member fields
// left open, then sent to both signers.
const createAgreement = catchAsync(async (req: Request, res: Response) => {
    const result = await createAgreementFromTemplate(req.body)

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: result.sent
            ? 'Agreement created and sent for signature'
            : 'Agreement created as a draft in Zoho Sign',
        data: result,
    })
})

// Sends a draft. Zoho emails every signatory, so this is not reversible.
const sendRequest = catchAsync(async (req: Request, res: Response) => {
    const result = await sendAgreement(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Agreement sent for signature',
        data: result,
    })
})

const getRequest = catchAsync(async (req: Request, res: Response) => {
    const result = await getAgreementStatus(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Signature request fetched',
        data: result,
    })
})

// Zoho calls this when a request changes. The body only identifies which request; the
// values are then read back from Zoho and stored.
const webhook = catchAsync(async (req: Request, res: Response) => {
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

    const result = await handleZohoSignWebhook(
        req.body,
        typeof req.query.event_type === 'string' ? req.query.event_type : undefined,
    )

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Agreement captured',
        data: result,
    })
})

// Pull the agreement from Zoho and store it, without waiting for a webhook.
const capture = catchAsync(async (req: Request, res: Response) => {
    const result = await captureAgreement(req.params.id as string, {
        reference: typeof req.body?.reference === 'string' ? req.body.reference : undefined,
        userId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
    })

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Agreement captured from Zoho',
        data: result,
    })
})

// Read what was stored, including every field the signatories filled.
const getStored = catchAsync(async (req: Request, res: Response) => {
    const result = await getStoredAgreement(req.params.id as string)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Agreement fetched from the local database',
        data: result,
    })
})

const listStored = catchAsync(async (req: Request, res: Response) => {
    const result = await listStoredAgreements({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
    })

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Agreements fetched from the local database',
        data: result,
    })
})

export const SignController = {
    webhook,
    capture,
    getStored,
    listStored,
    listTemplates,
    getTemplate,
    createAgreement,
    sendRequest,
    getRequest,
}
