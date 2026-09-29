import { prisma } from '../../../app/lib/prisma'
import { zohoSignClient } from './zoho-sign-client'

type TZohoField = {
    field_id: string
    field_name?: string
    field_label?: string
    field_value?: string
}

type TZohoAction = {
    action_id: string
    role?: string
    recipient_name?: string
    recipient_email?: string
    action_status?: string
    fields?: TZohoField[]
}

type TZohoRequest = {
    request_id: string
    request_name?: string
    request_status?: string
    template_id?: string
    sign_submitted_time?: number
    actions?: TZohoAction[]
    document_fields?: { fields?: TZohoField[] }[]
}

const toDate = (value?: number | null) => (value ? new Date(value) : null)

// Pulls the request from Zoho and writes it — recipients and every filled field — into the
// local tables. Zoho is always re-read rather than trusting a webhook body.
export const captureAgreement = async (
    requestId: string,
    options: { reference?: string; userId?: string } = {},
) => {
    const response = await zohoSignClient.get<{ requests: TZohoRequest }>(`/requests/${requestId}`)
    const request = response.data.requests

    const status = request.request_status ?? 'unknown'
    const isComplete = status === 'completed'

    const agreement = await prisma.signAgreement.upsert({
        where: { zohoRequestId: requestId },
        create: {
            zohoRequestId: requestId,
            requestName: request.request_name,
            status,
            completedAt: isComplete ? (toDate(request.sign_submitted_time) ?? new Date()) : null,
            ...(options.reference ? { reference: options.reference } : {}),
            ...(options.userId ? { userId: options.userId } : {}),
        },
        update: {
            requestName: request.request_name,
            status,
            completedAt: isComplete ? (toDate(request.sign_submitted_time) ?? new Date()) : null,
            ...(options.reference ? { reference: options.reference } : {}),
            ...(options.userId ? { userId: options.userId } : {}),
        },
    })

    for (const action of request.actions ?? []) {
        await prisma.signAgreementRecipient.upsert({
            where: {
                agreementId_zohoActionId: {
                    agreementId: agreement.id,
                    zohoActionId: action.action_id,
                },
            },
            create: {
                agreementId: agreement.id,
                zohoActionId: action.action_id,
                role: action.role,
                name: action.recipient_name,
                email: action.recipient_email,
                status: action.action_status,
                signedAt: action.action_status === 'SIGNED' ? new Date() : null,
            },
            update: {
                role: action.role,
                name: action.recipient_name,
                email: action.recipient_email,
                status: action.action_status,
                signedAt: action.action_status === 'SIGNED' ? new Date() : null,
            },
        })
    }

    // Values come from two places: document_fields carries what this backend pre-filled,
    // and each action's fields carry what that signatory typed.
    const prefilled = (request.document_fields ?? []).flatMap((doc) =>
        (doc.fields ?? []).map((field) => ({ field, filledBy: 'PREFILL' })),
    )

    const signerEntered = (request.actions ?? []).flatMap((action) =>
        (action.fields ?? []).map((field) => ({
            field,
            filledBy: action.role ?? action.action_id,
        })),
    )

    let stored = 0

    for (const { field, filledBy } of [...prefilled, ...signerEntered]) {
        // A field with no value is one the signatory has not reached yet.
        if (!field.field_value) continue

        await prisma.signAgreementField.upsert({
            where: {
                agreementId_zohoFieldId: {
                    agreementId: agreement.id,
                    zohoFieldId: field.field_id,
                },
            },
            create: {
                agreementId: agreement.id,
                zohoFieldId: field.field_id,
                fieldName: field.field_name,
                fieldLabel: field.field_label,
                value: field.field_value,
                filledBy,
            },
            update: {
                fieldName: field.field_name,
                fieldLabel: field.field_label,
                value: field.field_value,
                filledBy,
            },
        })

        stored += 1
    }

    console.log(`sign: captured request ${requestId} (${status}) — ${stored} field values stored`)

    return getStoredAgreement(requestId)
}

const serialize = (agreement: {
    id: string
    zohoRequestId: string
    requestName: string | null
    status: string
    reference: string | null
    completedAt: Date | null
    createdAt: Date
    recipients: {
        zohoActionId: string
        role: string | null
        name: string | null
        email: string | null
        status: string | null
        signedAt: Date | null
    }[]
    fields: {
        fieldName: string | null
        fieldLabel: string | null
        value: string
        filledBy: string | null
    }[]
}) => ({
    id: agreement.id,
    zohoRequestId: agreement.zohoRequestId,
    requestName: agreement.requestName,
    status: agreement.status,
    reference: agreement.reference,
    completedAt: agreement.completedAt,
    createdAt: agreement.createdAt,
    recipients: agreement.recipients,
    // Flat map of field name to value — the shape the app actually wants.
    values: Object.fromEntries(
        agreement.fields.map((field) => [field.fieldName || field.fieldLabel, field.value]),
    ),
    fields: agreement.fields,
})

export const getStoredAgreement = async (requestId: string) => {
    const agreement = await prisma.signAgreement.findUnique({
        where: { zohoRequestId: requestId },
        include: { recipients: true, fields: { orderBy: { fieldName: 'asc' } } },
    })

    if (!agreement) throw new Error(`No stored agreement for request ${requestId}`)

    return serialize(agreement)
}

export const listStoredAgreements = async (filters: { status?: string; userId?: string } = {}) => {
    const agreements = await prisma.signAgreement.findMany({
        where: {
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.userId ? { userId: filters.userId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: { recipients: true, fields: true },
    })

    return agreements.map(serialize)
}
