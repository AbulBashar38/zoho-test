import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import {
    createAgreementFromTemplate,
    getAgreementStatus,
    sendAgreement,
} from '../../../integrations/zoho/sign/sign-agreement.service'
import {
    getZohoSignTemplate,
    getZohoSignTemplateByName,
    listZohoSignTemplates,
} from '../../../integrations/zoho/sign/zoho-sign-template'
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

export const SignController = {
    listTemplates,
    getTemplate,
    createAgreement,
    sendRequest,
    getRequest,
}
