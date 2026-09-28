import {
    createDocumentFromTemplate,
    getZohoSignRequest,
    submitZohoSignRequest,
} from './zoho-sign-document'
import { getZohoSignTemplate, type TZohoSignTemplate } from './zoho-sign-template'

type TParty = { name?: string; email?: string }

export type TCreateAgreementPayload = {
    templateId: string
    // The HAUS+ signatory. Defaults to whoever the template already names.
    haus?: TParty
    // The member company signatory — the open slot on the template.
    member?: TParty
    // Anything more specific: target an action by its id or its role.
    recipients?: { actionId?: string; role?: string; name: string; email: string }[]
    // Values the admin pre-fills, keyed by the field label shown in the template.
    fields?: Record<string, string>
    dateFields?: Record<string, string>
    booleanFields?: Record<string, boolean>
    notes?: string
    // false leaves the request as a draft in Zoho Sign instead of emailing the signers.
    quickSend?: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isHausRole = (role?: string) => (role ?? '').toLowerCase().includes('haus')

const validateParty = (party: TParty | undefined, label: string) => {
    if (!party) return undefined

    if (party.email !== undefined && !EMAIL_PATTERN.test(party.email.trim())) {
        throw new Error(`${label}.email is not a valid email address`)
    }

    return {
        name: party.name?.trim(),
        email: party.email?.trim(),
    }
}

// Works out who signs each action on the template: an explicit recipient entry wins, then
// the haus/member shorthand matched on role, then whoever the template already names.
const resolveActions = (
    template: TZohoSignTemplate,
    payload: {
        haus?: TParty
        member?: TParty
        recipients?: { actionId?: string; role?: string; name: string; email: string }[]
    },
) => {
    const templateActions = template.actions ?? []

    if (!templateActions.length) {
        throw new Error(`Template ${template.template_id} has no recipient actions`)
    }

    const haus = validateParty(payload.haus, 'haus')
    const member = validateParty(payload.member, 'member')

    return templateActions.map((action) => {
        const explicit = payload.recipients?.find(
            (recipient) =>
                (recipient.actionId && recipient.actionId === action.action_id) ||
                (recipient.role &&
                    recipient.role.trim().toLowerCase() === (action.role ?? '').toLowerCase()),
        )

        const shorthand = isHausRole(action.role) ? haus : member

        const name = explicit?.name?.trim() || shorthand?.name || action.recipient_name
        const email = explicit?.email?.trim() || shorthand?.email || action.recipient_email

        if (!name || !email) {
            throw new Error(
                `No recipient for the "${action.role ?? action.action_id}" role. Supply it as ${
                    isHausRole(action.role) ? 'haus' : 'member'
                }: { name, email }, or via recipients[].`,
            )
        }

        if (!EMAIL_PATTERN.test(email)) {
            throw new Error(`"${email}" is not a valid email address`)
        }

        return {
            action_id: action.action_id,
            action_type: action.action_type ?? 'SIGN',
            recipient_name: name,
            recipient_email: email,
            role: action.role,
            verify_recipient: action.verify_recipient ?? false,
        }
    })
}

// Zoho documents the prefill map as keyed by field label, but a template can also carry a
// friendlier field_name. Each supplied key is matched against both, and the value is sent
// under every key that field answers to, so either naming works.
const expandFieldKeys = (
    template: TZohoSignTemplate,
    values: Record<string, unknown> | undefined,
) => {
    if (!values) return undefined

    type TField = { field_name?: string; field_label?: string }

    // Fields assigned to a signer live on the actions; fields the sender pre-fills live in
    // document_fields, which Zoho returns either as a flat array or bucketed by type.
    const documentFields = ((template.document_fields ?? []) as { fields?: unknown }[]).flatMap(
        (doc) => {
            if (Array.isArray(doc.fields)) return doc.fields as TField[]

            if (doc.fields && typeof doc.fields === 'object') {
                return Object.values(doc.fields as Record<string, TField[]>).flatMap(
                    (bucket) => bucket ?? [],
                )
            }

            return []
        },
    )

    const fields = [
        ...(template.actions ?? []).flatMap((action) => (action.fields ?? []) as TField[]),
        ...documentFields,
    ]

    const expanded: Record<string, unknown> = {}
    const unmatched: string[] = []

    for (const [key, value] of Object.entries(values)) {
        const matches = fields.filter(
            (field) => field.field_name === key || field.field_label === key,
        )

        if (!matches.length) {
            unmatched.push(key)
            expanded[key] = value
            continue
        }

        for (const field of matches) {
            // Zoho matches these on field_label — a field whose label differs from its name
            // is rejected as "This field has not been sent" when keyed by name alone. The
            // name is sent too, harmlessly, so either spelling in the request body works.
            if (field.field_label) expanded[field.field_label] = value
            if (field.field_name) expanded[field.field_name] = value
        }
    }

    if (unmatched.length) {
        console.warn(
            `sign: these keys match no field on the template and were passed through as-is: ${unmatched.join(', ')}`,
        )
    }

    return expanded as Record<string, never>
}

type TPrefillField = {
    field_name?: string
    field_label?: string
    field_category?: string
    is_mandatory?: boolean
    // Zoho validates a date value against the format configured on the field itself.
    date_format?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Turns an ISO date into whatever pattern the field expects, e.g. "MMM dd yyyy" -> "Oct 01 2026".
// Anything that is not a plain yyyy-mm-dd is passed through untouched.
const formatDateForField = (value: string, dateFormat?: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())

    if (!match || !dateFormat) return value

    const [, year, month, day] = match as unknown as [string, string, string, string]
    const monthName = MONTHS[Number(month) - 1] ?? month

    return (
        dateFormat
            .replace(/yyyy/g, year)
            .replace(/MMM/g, monthName)
            .replace(/MM/g, month)
            .replace(/dd/g, day)
            // Any time portion the format carries is meaningless for a date-only value.
            .replace(/\s*HH:mm(:ss)?(\s*z)?/g, '')
            .trim()
    )
}

const getPrefillFields = (template: TZohoSignTemplate): TPrefillField[] =>
    ((template.document_fields ?? []) as { fields?: unknown }[]).flatMap((doc) => {
        if (Array.isArray(doc.fields)) return doc.fields as TPrefillField[]

        if (doc.fields && typeof doc.fields === 'object') {
            return Object.values(doc.fields as Record<string, TPrefillField[]>).flatMap(
                (bucket) => bucket ?? [],
            )
        }

        return []
    })

// Zoho rejects the whole request if a mandatory sender-prefill field has no value
// ("This field has not been sent"), so catch it here with a readable message instead.
const assertMandatoryPrefillsPresent = (
    template: TZohoSignTemplate,
    supplied: Record<string, unknown>,
) => {
    const missing = getPrefillFields(template)
        .filter((field) => field.is_mandatory)
        .filter((field) => {
            const byName = field.field_name ? field.field_name in supplied : false
            const byLabel = field.field_label ? field.field_label in supplied : false
            return !byName && !byLabel
        })
        .map((field) => field.field_name || field.field_label)
        .filter((name): name is string => Boolean(name))

    if (missing.length) {
        throw new Error(
            `Zoho requires a value for every mandatory pre-fill field. Missing ${missing.length}: ${missing.join(', ')}`,
        )
    }
}

const validateFieldMap = (value: unknown, label: string) => {
    if (value === undefined) return undefined

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be an object keyed by field label`)
    }

    return value as Record<string, never>
}

// Creates one agreement from an existing template: the admin's values are pre-filled, the
// member's fields are left for them to complete, and both parties are sent the request.
export const createAgreementFromTemplate = async (payload: Partial<TCreateAgreementPayload>) => {
    const { templateId, fields, dateFields, booleanFields, notes, quickSend } = payload ?? {}

    if (typeof templateId !== 'string' || !templateId.trim()) {
        throw new Error('templateId is required')
    }

    validateFieldMap(fields, 'fields')
    validateFieldMap(dateFields, 'dateFields')
    validateFieldMap(booleanFields, 'booleanFields')

    // Read the template so the action ids, roles and order come from Zoho rather than the
    // caller, and so an unknown template fails before anything is sent.
    const template = await getZohoSignTemplate(templateId.trim())

    const actions = resolveActions(template, payload)

    // Every value the caller supplied, whichever map it arrived in.
    assertMandatoryPrefillsPresent(template, {
        ...(fields ?? {}),
        ...(dateFields ?? {}),
        ...(booleanFields ?? {}),
    })

    // Dates must arrive in the format configured on each field, not ISO.
    const prefillFields = getPrefillFields(template)
    const formattedDates = dateFields
        ? Object.fromEntries(
              Object.entries(dateFields as Record<string, string>).map(([key, value]) => {
                  const field = prefillFields.find(
                      (candidate) => candidate.field_name === key || candidate.field_label === key,
                  )

                  return [key, formatDateForField(String(value), field?.date_format)]
              }),
          )
        : undefined

    const request = await createDocumentFromTemplate({
        templateId: templateId.trim(),
        actions,
        fieldTextData: expandFieldKeys(template, fields) as Record<string, string> | undefined,
        fieldDateData: expandFieldKeys(template, formattedDates) as
            | Record<string, string>
            | undefined,
        fieldBooleanData: expandFieldKeys(template, booleanFields) as
            | Record<string, boolean>
            | undefined,
        notes,
        quickSend: quickSend ?? true,
    })

    console.log(
        `sign: request ${request.request_id} created from template ${templateId} (${
            quickSend === false ? 'draft' : 'sent'
        })`,
    )

    return {
        requestId: request.request_id,
        requestName: request.request_name,
        requestStatus: request.request_status,
        templateId: template.template_id,
        templateName: template.template_name,
        sent: quickSend !== false,
        prefilledFields: Object.keys(fields ?? {}).length,
        recipients: actions.map((action) => ({
            actionId: action.action_id,
            role: action.role,
            name: action.recipient_name,
            email: action.recipient_email,
        })),
    }
}

// Sends a draft for signature. Both signatories are emailed by Zoho at this point.
export const sendAgreement = async (requestId: string) => {
    const existing = await getZohoSignRequest(requestId)

    if (existing.request_status && existing.request_status !== 'draft') {
        throw new Error(
            `Request ${requestId} is already "${existing.request_status}" — only a draft can be sent.`,
        )
    }

    const request = await submitZohoSignRequest(requestId)

    console.log(`sign: request ${requestId} submitted for signature`)

    return {
        requestId: request.request_id ?? requestId,
        requestName: request.request_name ?? existing.request_name,
        requestStatus: request.request_status ?? 'inprogress',
        sent: true,
        recipients: (request.actions ?? existing.actions ?? []).map((action) => ({
            actionId: action.action_id,
            role: action.role,
            name: action.recipient_name,
            email: action.recipient_email,
            status: action.action_status,
        })),
    }
}

export const getAgreementStatus = async (requestId: string) => {
    const request = await getZohoSignRequest(requestId)

    return {
        requestId: request.request_id,
        requestName: request.request_name,
        requestStatus: request.request_status,
        recipients: (request.actions ?? []).map((action) => ({
            actionId: action.action_id,
            role: action.role,
            name: action.recipient_name,
            email: action.recipient_email,
            status: action.action_status,
        })),
    }
}
