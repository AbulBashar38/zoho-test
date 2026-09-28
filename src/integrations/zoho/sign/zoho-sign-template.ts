import { buildPageContext, signDataParam, zohoSignClient } from './zoho-sign-client'

export type TZohoSignTemplate = {
    template_id: string
    template_name: string
    description?: string
    created_time?: number
    modified_time?: number
    owner_first_name?: string
    owner_email?: string
    is_sequential?: boolean
    // Present on the details response: who signs and in what order.
    actions?: {
        action_id?: string
        action_type?: string
        recipient_name?: string
        recipient_email?: string
        signing_order?: number
        verify_recipient?: boolean
        fields?: unknown[]
    }[]
    document_ids?: { document_id: string; document_name?: string; total_pages?: number }[]
}

type TListParams = {
    rowCount?: number
    startIndex?: number
    // Matches Zoho's own template search.
    searchText?: string
}

export const listZohoSignTemplates = async (params: TListParams = {}) => {
    const response = await zohoSignClient.get<{ templates: TZohoSignTemplate[] }>('/templates', {
        params: {
            data: signDataParam(
                buildPageContext({
                    rowCount: params.rowCount,
                    startIndex: params.startIndex,
                    ...(params.searchText
                        ? { searchColumns: { template_name: params.searchText } }
                        : {}),
                }),
            ),
        },
    })

    return response.data.templates ?? []
}

// The details response carries the recipient actions and field definitions that sending a
// document from this template will need.
export const getZohoSignTemplate = async (templateId: string) => {
    const response = await zohoSignClient.get<{ templates: TZohoSignTemplate }>(
        `/templates/${templateId}`,
    )

    // Zoho returns the single template under the plural key here.
    return response.data.templates
}

export const findZohoSignTemplateByName = async (name: string) => {
    const wanted = name.trim().toLowerCase()
    const templates = await listZohoSignTemplates({ searchText: name.trim() })

    return templates.find((template) => template.template_name?.trim().toLowerCase() === wanted)
}

export const getZohoSignTemplateByName = async (name: string) => {
    const template = await findZohoSignTemplateByName(name)

    if (!template) {
        throw new Error(
            `No Zoho Sign template found with the exact name "${name}". List them with GET /api/sign/templates.`,
        )
    }

    // The list response is a summary; re-read it for the actions and fields.
    return getZohoSignTemplate(template.template_id)
}
