import { zohoBillingClient } from './zoho-billing-client'

export type TZohoBillingItem = {
    item_id: string
    name: string
    status?: string
    description?: string
    rate?: number
    unit?: string
    sku?: string
    product_type?: string
    tax_id?: string
    tax_name?: string
    tax_percentage?: number
}

// GET /items supports name, description, rate, search_text and filter_by.
export const listZohoBillingItems = async (params: Record<string, string> = {}) => {
    const response = await zohoBillingClient.get<{ items: TZohoBillingItem[] }>('/items', {
        params,
    })

    return response.data.items ?? []
}

export const getZohoBillingItem = async (itemId: string) => {
    const response = await zohoBillingClient.get<{ item: TZohoBillingItem }>(`/items/${itemId}`)

    return response.data.item
}

// Zoho's `name` filter matches loosely, so the exact match is picked out locally.
export const findZohoBillingItemByName = async (name: string) => {
    const wanted = name.trim().toLowerCase()
    const items = await listZohoBillingItems({ name: name.trim() })

    return items.find((item) => item.name?.trim().toLowerCase() === wanted)
}

// The id callers actually want when they know an item only by its name.
export const getZohoBillingItemIdByName = async (name: string) => {
    const item = await findZohoBillingItemByName(name)

    if (!item) {
        throw new Error(
            `No Zoho item found with the exact name "${name}". Check the name in the Zoho console, or search with ?search=${encodeURIComponent(name)}.`,
        )
    }

    return item
}
