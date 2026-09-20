import config from '../../../app/config'
import { zohoBillingClient } from './zoho-billing-client'

export type TZohoSubscription = {
    subscription_id: string
    customer_id: string
    status: string
    amount?: number
    currency_code?: string
    reference_id?: string
    activated_at?: string
    next_billing_at?: string
    plan?: { plan_code: string; name?: string; price?: number }
    child_invoice_id?: string
    invoice_id?: string
}

type TZohoPlan = {
    plan_code: string
    name: string
    recurring_price: number
    status?: string
}

// Plans are created in the Zoho Billing console; this only reads one back to confirm the
// plan_code exists before a subscription is attempted.
export const getZohoPlan = async (planCode: string) => {
    try {
        const response = await zohoBillingClient.get<{ plan: TZohoPlan }>(`/plans/${planCode}`)
        return response.data.plan
    } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) return undefined
        throw error
    }
}

type TCreateSubscriptionPayload = {
    customerId: string
    planCode: string
    price?: number
    quantity?: number
    referenceId?: string
}

// auto_collect stays false: the member pays the raised invoice on a hosted page rather than
// having a stored card charged.
export const createZohoSubscription = async ({
    customerId,
    planCode,
    price,
    quantity = 1,
    referenceId,
}: TCreateSubscriptionPayload) => {
    const response = await zohoBillingClient.post<{ subscription: TZohoSubscription }>(
        '/subscriptions',
        {
            customer_id: customerId,
            plan: {
                plan_code: planCode,
                quantity,
                ...(price !== undefined ? { price } : {}),
            },
            auto_collect: false,
            ...(referenceId ? { reference_id: referenceId } : {}),
            ...(config.zoho.billing_place_of_supply
                ? { place_of_supply: config.zoho.billing_place_of_supply }
                : {}),
        },
    )

    return response.data.subscription
}

export const getZohoSubscription = async (subscriptionId: string) => {
    const response = await zohoBillingClient.get<{ subscription: TZohoSubscription }>(
        `/subscriptions/${subscriptionId}`,
    )

    return response.data.subscription
}
