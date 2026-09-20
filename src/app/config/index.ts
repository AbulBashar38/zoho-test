import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env') })

export default {
    node_env: process.env.NODE_ENV,
    port: process.env.PORT,
    database_url: process.env.DATABASE_URL,
    // Public base URL of this backend; Zoho redirects back here after a payment.
    bak_url: process.env.BACKEND_URL || process.env.APP_URL,
    frontend_url: process.env.FRONTEND_URL,
    bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
    jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
    jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
    jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
    zoho: {
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        organization_id: process.env.ZOHO_ORGANIZATION_ID,
        // Zoho Billing runs in its own organization; falls back to the Books one when shared.
        billing_organization_id:
            process.env.ZOHO_BILLING_ORGANIZATION_ID || process.env.ZOHO_ORGANIZATION_ID,
        // India edition requires these on customers and subscriptions.
        billing_gst_treatment: process.env.ZOHO_BILLING_GST_TREATMENT,
        billing_place_of_supply: process.env.ZOHO_BILLING_PLACE_OF_SUPPLY,
        // Shared secret checked on the webhook endpoint, which Zoho does not sign.
        webhook_secret: process.env.ZOHO_WEBHOOK_SECRET,
        // Only needed if the authorization code was generated with a redirect URI.
        redirect_uri: process.env.ZOHO_REDIRECT_URI,
        api_domain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
        accounts_domain: process.env.ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.com',
    },
}
