import { zohoBillingClient } from './zoho-billing-client'

export type TZohoBillingProduct = {
    product_id: string
    name: string
    description?: string
    status?: string
    email_ids?: string
    redirect_url?: string
    created_time?: string
    updated_time?: string
}

const PER_PAGE = 200
const MAX_PAGES = 10

export const listZohoProducts = async (params: Record<string, string | number> = {}) => {
    const response = await zohoBillingClient.get<{ products: TZohoBillingProduct[] }>('/products', {
        params,
    })

    return response.data.products ?? []
}

export const getZohoProduct = async (productId: string) => {
    const response = await zohoBillingClient.get<{ product: TZohoBillingProduct }>(
        `/products/${productId}`,
    )

    return response.data.product
}

// Zoho's product list takes no name filter, so pages are walked and matched here.
export const listAllZohoProducts = async () => {
    const all: TZohoBillingProduct[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await zohoBillingClient.get<{
            products: TZohoBillingProduct[]
            page_context?: { has_more_page?: boolean }
        }>('/products', { params: { page, per_page: PER_PAGE } })

        all.push(...(response.data.products ?? []))

        if (!response.data.page_context?.has_more_page) break
    }

    return all
}

export const findZohoProductByName = async (name: string) => {
    const wanted = name.trim().toLowerCase()
    const products = await listAllZohoProducts()

    return products.find((product) => product.name?.trim().toLowerCase() === wanted)
}

// The id callers want when they only know the product by name.
export const getZohoProductIdByName = async (name: string) => {
    const product = await findZohoProductByName(name)

    if (!product) {
        throw new Error(
            `No Zoho product found with the exact name "${name}". Check the name in the Zoho console, or list them with GET /api/billing/products.`,
        )
    }

    return product
}
