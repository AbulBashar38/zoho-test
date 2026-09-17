import { zohoClient } from './zoho-client'

type TZohoItem = {
    item_id: string
    name: string
    rate: number
    status?: string
}

type TZohoItemPayload = {
    name: string
    rate: number
}

export const createZohoItem = async ({ name, rate }: TZohoItemPayload) => {
    const response = await zohoClient.post<{ item: TZohoItem }>('/items', {
        name,
        rate,
        product_type: 'service',
        description: 'Zoho Books API integration test item',
    })

    return response.data.item
}

export const findZohoItemByName = async (name: string) => {
    const response = await zohoClient.get<{ items: TZohoItem[] }>('/items', {
        params: { name },
    })

    return response.data.items.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

// The project has no product/service model to hold a zohoItemId mapping, so the item
// name is the lookup key — repeated test runs reuse the same Zoho item.
export const getOrCreateZohoItem = async ({ name, rate }: TZohoItemPayload) => {
    const existingItem = await findZohoItemByName(name)

    if (existingItem) {
        return existingItem.item_id
    }

    const item = await createZohoItem({ name, rate })

    return item.item_id
}
