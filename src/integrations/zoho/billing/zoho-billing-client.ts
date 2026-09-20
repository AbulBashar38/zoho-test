import config from '../../../app/config'
import { createZohoClient } from '../zoho-client'

// Zoho Billing (formerly Subscriptions) lives on its own base path and identifies the
// organization with a header instead of the organization_id query param that Books uses.
export const zohoBillingClient = createZohoClient({
    baseURL: `${config.zoho.api_domain}/billing/v1`,
    decorateRequest: (request) => {
        const organizationId = config.zoho.billing_organization_id

        if (organizationId) {
            request.headers.set('X-com-zoho-subscriptions-organizationid', organizationId)
        }
    },
})
