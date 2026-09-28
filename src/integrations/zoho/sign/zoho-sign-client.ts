import config from '../../../app/config'
import { createZohoClient } from '../zoho-client'

// Zoho Sign lives on its own host — sign.zoho.com, or sign.zoho.in for the India data
// centre — and needs no organization header, unlike Books and Billing.
export const zohoSignClient = createZohoClient({
    baseURL: `${config.zoho.sign_domain}/api/v1`,
})

// Sign takes paging and search as URL-encoded JSON in a single `data` query param rather
// than as ordinary query parameters.
export const signDataParam = (value: object) => JSON.stringify(value)

export const buildPageContext = (params: {
    rowCount?: number
    startIndex?: number
    sortColumn?: string
    sortOrder?: 'ASC' | 'DESC'
    searchColumns?: Record<string, string>
}) => ({
    page_context: {
        row_count: params.rowCount ?? 100,
        start_index: params.startIndex ?? 1,
        sort_column: params.sortColumn ?? 'created_time',
        sort_order: params.sortOrder ?? 'DESC',
        ...(params.searchColumns ? { search_columns: params.searchColumns } : {}),
    },
})
