import { zohoSignClient } from './zoho-sign-client'

export type TZohoSignAction = {
    action_id: string
    action_type: string
    recipient_name?: string
    recipient_email?: string
    role?: string
    signing_order?: number
    verify_recipient?: boolean
    action_status?: string
}

export type TZohoSignRequest = {
    request_id: string
    request_name?: string
    request_status?: string
    owner_email?: string
    sign_submitted_time?: number
    expiration_days?: number
    actions?: TZohoSignAction[]
}

type TCreateDocumentPayload = {
    templateId: string
    // Every action on the template must be supplied; Zoho rejects a different count.
    actions: {
        action_id: string
        action_type: string
        recipient_name: string
        recipient_email: string
        role?: string
        verify_recipient?: boolean
    }[]
    fieldTextData?: Record<string, string>
    fieldDateData?: Record<string, string>
    fieldBooleanData?: Record<string, boolean>
    notes?: string
    // true sends it straight to the signers; false leaves it as a draft in Zoho Sign.
    quickSend?: boolean
}

// Creates a signature request from an existing template. The template itself is never
// modified. Sign expects form-encoded fields, with the payload as JSON in `data`.
export const createDocumentFromTemplate = async ({
    templateId,
    actions,
    fieldTextData,
    fieldDateData,
    fieldBooleanData,
    notes,
    quickSend = true,
}: TCreateDocumentPayload) => {
    const data = {
        templates: {
            field_data: {
                field_text_data: fieldTextData ?? {},
                field_boolean_data: fieldBooleanData ?? {},
                field_date_data: fieldDateData ?? {},
            },
            actions: actions.map((action) => ({
                action_id: action.action_id,
                action_type: action.action_type,
                recipient_name: action.recipient_name,
                recipient_email: action.recipient_email,
                ...(action.role ? { role: action.role } : {}),
                verify_recipient: action.verify_recipient ?? false,
            })),
            ...(notes ? { notes } : {}),
        },
    }

    const body = new URLSearchParams({
        data: JSON.stringify(data),
        is_quicksend: String(quickSend),
    })

    const response = await zohoSignClient.post<{ requests: TZohoSignRequest }>(
        `/templates/${templateId}/createdocument`,
        body,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    return response.data.requests
}

// Sends a draft request to its recipients. Zoho emails each signatory at this point, so
// this is the step that makes the agreement real.
export const submitZohoSignRequest = async (requestId: string) => {
    const response = await zohoSignClient.post<{ requests: TZohoSignRequest }>(
        `/requests/${requestId}/submit`,
        // The optional `data` body only carries action overrides; the request already has
        // its recipients, so an empty form body sends it as-is.
        new URLSearchParams(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    return response.data.requests
}

// The values currently held on a request's fields — used to confirm what a prefill landed on.
export const getZohoSignRequestFieldData = async (requestId: string) => {
    const response = await zohoSignClient.get<{ field_data?: Record<string, unknown> }>(
        `/requests/${requestId}/fielddata`,
    )

    return response.data
}

export const getZohoSignRequest = async (requestId: string) => {
    const response = await zohoSignClient.get<{ requests: TZohoSignRequest }>(
        `/requests/${requestId}`,
    )

    return response.data.requests
}
