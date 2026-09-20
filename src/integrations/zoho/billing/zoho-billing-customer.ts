import config from '../../../app/config'
import { prisma } from '../../../app/lib/prisma'
import { zohoBillingClient } from './zoho-billing-client'

type TZohoBillingCustomer = {
    customer_id: string
    display_name: string
    email?: string
}

type TCreateCustomerPayload = {
    displayName: string
    email: string
    phone?: string | null
}

const PER_PAGE = 200
const MAX_PAGES = 10

// Zoho Billing documents no email filter on the customer list, so pass it as a hint and
// match locally, walking a bounded number of pages.
export const findZohoBillingCustomer = async (params: { email?: string; displayName?: string }) => {
    const email = params.email?.trim().toLowerCase()
    const displayName = params.displayName?.trim().toLowerCase()

    if (!email && !displayName) return undefined

    for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await zohoBillingClient.get<{
            customers: TZohoBillingCustomer[]
            page_context?: { has_more_page?: boolean }
        }>('/customers', {
            params: { page, per_page: PER_PAGE, ...(email ? { email } : {}) },
        })

        const customers = response.data.customers ?? []

        const match = customers.find(
            (customer) =>
                (email && customer.email?.trim().toLowerCase() === email) ||
                (displayName && customer.display_name?.trim().toLowerCase() === displayName),
        )

        if (match) return match

        if (!response.data.page_context?.has_more_page) return undefined
    }

    return undefined
}

export const createZohoBillingCustomer = async ({
    displayName,
    email,
    phone,
}: TCreateCustomerPayload) => {
    const response = await zohoBillingClient.post<{ customer: TZohoBillingCustomer }>(
        '/customers',
        {
            display_name: displayName,
            email,
            ...(phone ? { mobile: phone } : {}),
            // India edition rejects customers without a GST treatment and place of supply.
            ...(config.zoho.billing_gst_treatment
                ? { gst_treatment: config.zoho.billing_gst_treatment }
                : {}),
            ...(config.zoho.billing_place_of_supply
                ? { place_of_contact: config.zoho.billing_place_of_supply }
                : {}),
        },
    )

    return response.data.customer
}

// Zoho rejects a duplicate display name with code 3062.
const isDuplicateNameError = (error: unknown) => (error as { zohoCode?: number })?.zohoCode === 3062

export const getOrCreateZohoBillingCustomer = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { patient: true },
    })

    if (!user) {
        throw new Error(`User not found: ${userId}`)
    }

    if (user.zohoBillingCustomerId) {
        return user.zohoBillingCustomerId
    }

    const saveCustomerId = async (customerId: string) => {
        await prisma.user.update({
            where: { id: user.id },
            data: { zohoBillingCustomerId: customerId },
        })

        return customerId
    }

    // The customer may already exist in Zoho — created by the Books test, by an earlier run,
    // or by hand in the console — while this database has no mapping for it yet.
    const existing = await findZohoBillingCustomer({ email: user.email, displayName: user.name })

    if (existing) {
        return saveCustomerId(existing.customer_id)
    }

    try {
        const customer = await createZohoBillingCustomer({
            displayName: user.name,
            email: user.email,
            phone: user.patient?.contactNumber,
        })

        return saveCustomerId(customer.customer_id)
    } catch (error) {
        if (!isDuplicateNameError(error)) throw error

        // Zoho says the name is taken but the search missed it: look it up by name and adopt
        // that record rather than failing the subscription.
        const duplicate = await findZohoBillingCustomer({ displayName: user.name })

        if (!duplicate) {
            throw new Error(
                `Zoho already has a customer named "${user.name}" but it could not be found by email (${user.email}) or name. Open it in the Zoho console and check the name and email match this user.`,
            )
        }

        return saveCustomerId(duplicate.customer_id)
    }
}
