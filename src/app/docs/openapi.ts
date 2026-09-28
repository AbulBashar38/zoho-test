// OpenAPI description of every route this backend exposes. Kept by hand rather than
// generated, so the examples stay meaningful.
import config from '../config'

const envelope = (dataSchema: object, message: string) => ({
    type: 'object',
    properties: {
        success: { type: 'boolean', example: true },
        statusCode: { type: 'integer', example: 200 },
        message: { type: 'string', example: message },
        data: dataSchema,
    },
})

const jsonBody = (schema: object, example?: object) => ({
    required: true,
    content: {
        'application/json': {
            schema,
            ...(example ? { example } : {}),
        },
    },
})

const jsonResponse = (description: string, schema: object) => ({
    description,
    content: { 'application/json': { schema } },
})

const ERROR_RESPONSE = {
    type: 'object',
    properties: {
        success: { type: 'boolean', example: false },
        statusCode: { type: 'integer', example: 500 },
        name: { type: 'string', example: 'ZohoApiError' },
        message: {
            type: 'string',
            example:
                'Zoho API POST /invoices failed — HTTP 400 (invalid request/payload): ... [Zoho code 4]',
        },
    },
}

const ORDER_ITEM = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        type: { type: 'string', example: 'MEETING_ROOM' },
        description: { type: 'string', example: 'Meeting Room - 2 hours' },
        zohoProductId: { type: 'string', nullable: true },
        quantity: { type: 'string', example: '2' },
        unitPrice: { type: 'string', example: '500' },
        total: { type: 'string', example: '1000' },
    },
}

const ORDER = {
    type: 'object',
    properties: {
        id: { type: 'string', format: 'uuid' },
        orderNumber: { type: 'string', example: 'ORDER-123' },
        description: { type: 'string', nullable: true, example: 'Order #123' },
        totalAmount: { type: 'string', example: '1300' },
        currencyCode: { type: 'string', nullable: true, example: 'INR' },
        status: {
            type: 'string',
            enum: ['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'],
            example: 'PENDING',
        },
        paymentUrl: {
            type: 'string',
            nullable: true,
            description: 'Send the payer here. Hosted checkout page, or a payment link URL.',
            example: 'https://billing.zohosecure.com/hostedpage/.../checkout',
        },
        zohoInvoiceId: { type: 'string', nullable: true, example: '1344209000000137021' },
        invoiceNumber: { type: 'string', nullable: true, example: 'INV-000013' },
        zohoPaymentLinkId: { type: 'string', nullable: true },
        paymentLinkNumber: { type: 'string', nullable: true, example: 'PL-00007' },
        zohoCustomerId: { type: 'string', example: '1344209000000104002' },
        zohoPaymentId: { type: 'string', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        paidAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        items: { type: 'array', items: ORDER_ITEM },
    },
}

const CREATE_ORDER_BODY = {
    type: 'object',
    description:
        'Identify the payer with userId or zohoCustomerId, and price the order with items[] (preferred) or a single amount + description.',
    properties: {
        userId: { type: 'string', format: 'uuid', description: 'Resolved to a Zoho customer.' },
        zohoCustomerId: { type: 'string', description: 'Use instead of userId when known.' },
        orderNumber: {
            type: 'string',
            description: 'Your reference. Generated when omitted. Must be unique.',
            example: 'ORDER-123',
        },
        description: { type: 'string', example: 'Order #123' },
        items: {
            type: 'array',
            description: 'The total is calculated from these; the caller never sets it.',
            items: {
                type: 'object',
                required: ['description', 'unitPrice'],
                properties: {
                    type: { type: 'string', example: 'MEETING_ROOM' },
                    description: { type: 'string', example: 'Meeting Room' },
                    quantity: { type: 'number', default: 1, example: 2 },
                    unitPrice: { type: 'number', example: 500 },
                    productId: {
                        type: 'string',
                        description: 'Optional Zoho item id for this line.',
                    },
                },
            },
        },
        amount: {
            type: 'number',
            description: 'Single-line shorthand, used when items is absent.',
        },
        expiryTime: {
            type: 'string',
            description: 'Payment links only. yyyy-mm-dd. Zoho defaults to 15 days.',
            example: '2026-10-20',
        },
    },
}

const ORDER_EXAMPLE = {
    userId: '0e50f914-032b-42e3-b061-5998c14885f0',
    orderNumber: 'ORDER-123',
    description: 'Order #123',
    items: [
        { type: 'MEETING_ROOM', description: 'Meeting Room', quantity: 2, unitPrice: 500 },
        { type: 'PRINT', description: 'Printing - 20 pages', quantity: 20, unitPrice: 5 },
        { type: 'FOOD', description: 'Coffee', quantity: 2, unitPrice: 100 },
    ],
}

const ORDER_RESPONSE = jsonResponse(
    'The order, with its payment URL',
    envelope(ORDER, 'Order created. Send the user to paymentUrl.'),
)

const SIGN_TEMPLATE = {
    type: 'object',
    properties: {
        template_id: { type: 'string', example: '619865000000047066' },
        template_name: { type: 'string', example: 'HAUS+ Membership Agreement.docx' },
        description: { type: 'string', nullable: true },
        is_sequential: { type: 'boolean', description: 'Whether recipients must sign in order.' },
        owner_email: { type: 'string', format: 'email' },
        document_ids: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    document_id: { type: 'string' },
                    document_name: { type: 'string', example: 'HAUS+ Membership Agreement latest' },
                    total_pages: { type: 'integer', example: 25 },
                },
            },
        },
        actions: {
            type: 'array',
            description: 'Details response only. One entry per recipient of the template.',
            items: {
                type: 'object',
                properties: {
                    action_id: { type: 'string', example: '619865000000047081' },
                    action_type: { type: 'string', example: 'SIGN' },
                    signing_order: { type: 'integer', example: 2 },
                    recipient_name: {
                        type: 'string',
                        description: 'Blank when the template leaves this signer open.',
                    },
                    recipient_email: { type: 'string', description: 'Blank when left open.' },
                    fields: { type: 'array', items: { type: 'object' } },
                },
            },
        },
    },
}

const pathParam = (name: string, description: string) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description,
})

export const openapiSpec = {
    openapi: '3.0.3',
    info: {
        title: 'Zoho Integration API',
        version: '1.0.0',
        description: [
            'Backend integration with Zoho Books, Zoho Billing and Razorpay.',
            '',
            '**How money is collected:** this backend prices every order and stores it in',
            'PostgreSQL. Zoho hosts the payment page and confirms the payment by webhook;',
            'the webhook is the only thing that marks an order PAID.',
            '',
            '**Authorization:** Zoho access tokens are managed server-side from a stored',
            'refresh token. Call `POST /api/zoho/authorize` once with a Self Client code.',
        ].join('\n'),
    },
    servers: [{ url: config.bak_url || 'http://localhost:5050', description: 'This backend' }],
    tags: [
        { name: 'Auth', description: 'User registration and login' },
        { name: 'Zoho OAuth', description: 'Token setup and connectivity checks' },
        { name: 'Orders', description: 'Priced locally, collected through Zoho' },
        { name: 'Billing', description: 'Subscriptions, invoices and catalogue lookups' },
        { name: 'Books', description: 'Accounting records for payments collected elsewhere' },
        { name: 'Zoho Sign', description: 'Signature templates' },
        { name: 'Webhooks', description: 'Called by Zoho, not by your app' },
    ],
    paths: {
        '/api/v1/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Register a patient user',
                requestBody: jsonBody(
                    {
                        type: 'object',
                        required: ['name', 'email', 'password'],
                        properties: {
                            name: { type: 'string' },
                            email: { type: 'string', format: 'email' },
                            password: { type: 'string', minLength: 6 },
                        },
                    },
                    { name: 'basarTest', email: 'basartest@gmail.com', password: '12345678' },
                ),
                responses: {
                    201: jsonResponse(
                        'Created, with tokens and the new user',
                        envelope({ type: 'object' }, 'Patient registered successfully'),
                    ),
                    500: jsonResponse('Validation or server error', ERROR_RESPONSE),
                },
            },
        },
        '/api/v1/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Log in',
                requestBody: jsonBody({
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string' },
                    },
                }),
                responses: {
                    200: jsonResponse(
                        'Access and refresh tokens',
                        envelope({ type: 'object' }, 'User logged in successfully'),
                    ),
                },
            },
        },
        '/api/v1/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Current user profile',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: jsonResponse(
                        'The signed-in user',
                        envelope({ type: 'object' }, 'User profile fetched successfully'),
                    ),
                },
            },
        },
        '/api/v1/auth/refresh-token': {
            post: {
                tags: ['Auth'],
                summary: 'Exchange the refresh cookie for new tokens',
                responses: {
                    200: jsonResponse(
                        'New tokens',
                        envelope({ type: 'object' }, 'New tokens generated successfully'),
                    ),
                },
            },
        },

        '/api/zoho/authorize': {
            post: {
                tags: ['Zoho OAuth'],
                summary: 'Exchange a Self Client code for a refresh token',
                description:
                    'Run once per authorization. The refresh token is stored in the database and never returned. Send a new code to add scopes — it replaces the stored one, so the code must carry every scope the app needs.',
                requestBody: jsonBody(
                    {
                        type: 'object',
                        required: ['code'],
                        properties: { code: { type: 'string' } },
                    },
                    { code: '1000.xxxxxxxx.yyyyyyyy' },
                ),
                responses: {
                    200: jsonResponse(
                        'Authorized. No tokens are included.',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    organizationId: { type: 'string', nullable: true },
                                    scope: { type: 'string', nullable: true },
                                    authorizedAt: { type: 'string', format: 'date-time' },
                                    accessTokenExpiresIn: { type: 'integer', example: 3600 },
                                },
                            },
                            'Zoho integration authorized and refresh token stored',
                        ),
                    ),
                },
            },
        },
        '/api/zoho/oauth/callback': {
            get: {
                tags: ['Zoho OAuth'],
                summary: 'Redirect callback for the browser OAuth flow',
                parameters: [
                    {
                        name: 'code',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Authorization code from Zoho.',
                    },
                    {
                        name: 'error',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Set when the user declined, e.g. access_denied.',
                    },
                ],
                responses: {
                    200: jsonResponse(
                        'Authorized',
                        envelope(
                            { type: 'object' },
                            'Zoho authorization successful. You can close this tab.',
                        ),
                    ),
                    400: jsonResponse('Missing code, or Zoho reported an error', ERROR_RESPONSE),
                },
            },
        },
        '/api/zoho/test': {
            get: {
                tags: ['Zoho OAuth'],
                summary: 'Connectivity check (Books organizations)',
                description:
                    'Confirms OAuth, domain and token are working. Also the easiest way to find your organization id. Hidden in production.',
                responses: {
                    200: jsonResponse(
                        'Raw Zoho organizations response',
                        envelope({ type: 'object' }, 'Zoho Books connection is working'),
                    ),
                },
            },
            post: {
                tags: ['Zoho OAuth'],
                summary: 'End-to-end Books test (contact → item → invoice → payment)',
                description: 'Creates real records in Zoho Books. Hidden in production.',
                requestBody: jsonBody(
                    {
                        type: 'object',
                        required: ['userId', 'amount', 'itemName', 'paymentReference'],
                        properties: {
                            userId: { type: 'string', format: 'uuid' },
                            amount: { type: 'number', example: 1000 },
                            itemName: { type: 'string', example: 'Test Workspace' },
                            paymentReference: { type: 'string', example: 'TEST-RP-001' },
                            paymentMode: { type: 'string', default: 'cash' },
                        },
                    },
                    {
                        userId: '0e50f914-032b-42e3-b061-5998c14885f0',
                        amount: 1000,
                        itemName: 'Test Workspace',
                        paymentReference: 'TEST-RP-001',
                    },
                ),
                responses: {
                    200: jsonResponse(
                        'The Zoho ids created',
                        envelope({ type: 'object' }, 'Zoho Books integration test completed'),
                    ),
                },
            },
        },

        '/api/orders': {
            post: {
                tags: ['Orders'],
                summary: 'Create an order and a one-time Zoho invoice',
                description:
                    'The default route. Every line item is sent to Zoho, and `paymentUrl` is the hosted checkout page for the resulting invoice. The order row is written before any Zoho call, so a failure leaves a PENDING order you can finish with `POST /api/orders/{id}/invoice`.',
                requestBody: jsonBody(CREATE_ORDER_BODY, ORDER_EXAMPLE),
                responses: {
                    201: ORDER_RESPONSE,
                    500: jsonResponse('Validation or Zoho error', ERROR_RESPONSE),
                },
            },
            get: {
                tags: ['Orders'],
                summary: 'List orders from the local database',
                parameters: [
                    { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                    {
                        name: 'status',
                        in: 'query',
                        schema: {
                            type: 'string',
                            enum: ['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'],
                        },
                    },
                ],
                responses: {
                    200: jsonResponse(
                        'Orders, newest first',
                        envelope({ type: 'array', items: ORDER }, 'Orders fetched'),
                    ),
                },
            },
        },
        '/api/orders/invoice': {
            post: {
                tags: ['Orders'],
                summary: 'Create an order and invoice (same as POST /api/orders)',
                requestBody: jsonBody(CREATE_ORDER_BODY, ORDER_EXAMPLE),
                responses: { 201: ORDER_RESPONSE },
            },
        },
        '/api/orders/links': {
            post: {
                tags: ['Orders'],
                summary: 'Create an order and a Zoho payment link',
                description:
                    'One Zoho call instead of two or three, but the link carries no line items and a paid link produces an unapplied credit rather than an invoice. The order number is appended to the link description so it can be traced in Zoho.',
                requestBody: jsonBody(CREATE_ORDER_BODY, {
                    ...ORDER_EXAMPLE,
                    orderNumber: 'ORDER-PL-1',
                    expiryTime: '2026-10-20',
                }),
                responses: { 201: ORDER_RESPONSE },
            },
        },
        '/api/orders/{id}': {
            get: {
                tags: ['Orders'],
                summary: 'Fetch one order',
                parameters: [
                    pathParam('id', 'Local order id (uuid).'),
                    {
                        name: 'sync',
                        in: 'query',
                        schema: { type: 'boolean' },
                        description: 'true re-reads the invoice or link status from Zoho first.',
                    },
                ],
                responses: { 200: ORDER_RESPONSE },
            },
        },
        '/api/orders/number/{orderNumber}': {
            get: {
                tags: ['Orders'],
                summary: 'Fetch one order by your own order number',
                parameters: [
                    pathParam('orderNumber', 'The reference you supplied, e.g. ORDER-123.'),
                ],
                responses: { 200: ORDER_RESPONSE },
            },
        },
        '/api/orders/{id}/invoice': {
            post: {
                tags: ['Orders'],
                summary: 'Create or refresh the Zoho invoice for an existing order',
                description:
                    'Finishes an order whose invoice failed to be created, or issues a fresh checkout URL for one that already has an invoice. Refuses on a paid order.',
                parameters: [pathParam('id', 'Local order id.')],
                responses: { 200: ORDER_RESPONSE },
            },
        },
        '/api/orders/{id}/sync': {
            post: {
                tags: ['Orders'],
                summary: 'Re-check the payment status with Zoho',
                description:
                    'Useful when a webhook is delayed. Zoho decides; a partial payment stays PENDING.',
                parameters: [pathParam('id', 'Local order id.')],
                responses: { 200: ORDER_RESPONSE },
            },
        },
        '/api/orders/{id}/cancel': {
            post: {
                tags: ['Orders'],
                summary: 'Cancel the order and its payment link',
                parameters: [pathParam('id', 'Local order id.')],
                responses: {
                    200: ORDER_RESPONSE,
                    500: jsonResponse('Already paid, or a Zoho error', ERROR_RESPONSE),
                },
            },
        },

        '/api/billing/subscribe': {
            post: {
                tags: ['Billing'],
                summary: 'Subscribe a user to an existing Zoho plan',
                description:
                    'The plan must already exist in the Zoho console; `planCode` is its plan_code. Returns the payment URL for the first invoice.',
                requestBody: jsonBody(
                    {
                        type: 'object',
                        required: ['userId', 'planCode'],
                        properties: {
                            userId: { type: 'string', format: 'uuid' },
                            planCode: { type: 'string', example: 'single-seat-monthly' },
                            price: { type: 'number', description: 'Overrides the plan rate.' },
                            quantity: { type: 'integer', default: 1 },
                            reference: { type: 'string' },
                        },
                    },
                    {
                        userId: '0e50f914-032b-42e3-b061-5998c14885f0',
                        planCode: 'single-seat-monthly',
                    },
                ),
                responses: {
                    200: jsonResponse(
                        'Subscription and first invoice',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    zohoCustomerId: { type: 'string' },
                                    planCode: { type: 'string' },
                                    zohoSubscriptionId: { type: 'string' },
                                    subscriptionStatus: { type: 'string', example: 'live' },
                                    zohoInvoiceId: { type: 'string', nullable: true },
                                    invoiceNumber: { type: 'string', nullable: true },
                                    amountDue: { type: 'number' },
                                    paymentUrl: { type: 'string', nullable: true },
                                },
                            },
                            'Subscription created. Redirect the user to paymentUrl.',
                        ),
                    ),
                },
            },
        },
        '/api/billing/items': {
            get: {
                tags: ['Billing'],
                summary: 'Look up Zoho items',
                description:
                    '`name` returns the single exact match with its item_id; `search` returns partial matches; neither returns everything.',
                parameters: [
                    {
                        name: 'name',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Exact name.',
                    },
                    {
                        name: 'search',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Partial text.',
                    },
                ],
                responses: {
                    200: jsonResponse(
                        'One item, or a list',
                        envelope({ type: 'object' }, 'Item found'),
                    ),
                },
            },
        },
        '/api/billing/items/{id}': {
            get: {
                tags: ['Billing'],
                summary: 'Fetch one Zoho item by id',
                parameters: [pathParam('id', 'Zoho item_id.')],
                responses: {
                    200: jsonResponse(
                        'The item',
                        envelope({ type: 'object' }, 'Item fetched from Zoho'),
                    ),
                },
            },
        },
        '/api/billing/products': {
            get: {
                tags: ['Billing'],
                summary: 'Look up Zoho products',
                description:
                    'Products are the catalogue plans hang off, and are distinct from items.',
                parameters: [
                    {
                        name: 'name',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Exact name.',
                    },
                ],
                responses: {
                    200: jsonResponse(
                        'One product, or the full list',
                        envelope({ type: 'object' }, 'Product found'),
                    ),
                },
            },
        },
        '/api/billing/products/{id}': {
            get: {
                tags: ['Billing'],
                summary: 'Fetch one Zoho product by id',
                parameters: [pathParam('id', 'Zoho product_id.')],
                responses: {
                    200: jsonResponse(
                        'The product',
                        envelope({ type: 'object' }, 'Product fetched from Zoho'),
                    ),
                },
            },
        },
        '/api/billing/invoices': {
            get: {
                tags: ['Billing'],
                summary: 'Mirrored Zoho invoices from the local database',
                parameters: [
                    { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                ],
                responses: {
                    200: jsonResponse(
                        'Invoices with their payments',
                        envelope(
                            { type: 'array', items: { type: 'object' } },
                            'Invoices fetched from the local mirror',
                        ),
                    ),
                },
            },
        },
        '/api/billing/invoices/{id}/pay': {
            post: {
                tags: ['Billing'],
                summary: 'Payment URL for an existing Zoho invoice',
                description:
                    'Opens the invoice if it is still a draft, then returns its hosted checkout page.',
                parameters: [pathParam('id', 'Zoho invoice_id.')],
                responses: {
                    200: jsonResponse(
                        'Payment page, or a note that nothing is owed',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    zohoInvoiceId: { type: 'string' },
                                    invoiceNumber: { type: 'string', nullable: true },
                                    status: { type: 'string', example: 'sent' },
                                    balance: { type: 'number', example: 1000 },
                                    paymentUrl: { type: 'string', nullable: true },
                                },
                            },
                            'Payment page ready',
                        ),
                    ),
                },
            },
        },

        '/api/books/orders': {
            post: {
                tags: ['Books'],
                summary: 'Record an already-paid order in Zoho Books',
                description: [
                    'Call this once your gateway (Razorpay) confirms the payment. No money moves',
                    'here — Zoho Books only receives the accounting record.',
                    '',
                    'In one request: find or create the contact, raise an invoice carrying your',
                    'line items, issue it, then apply the payment so the invoice settles at a zero',
                    'balance. Zoho sets the paid status itself once the balance reaches zero.',
                    '',
                    '**Idempotent on `orderNumber`** — a repeat call returns 200 with the invoice',
                    'already recorded instead of invoicing twice, so it is safe to call from a',
                    'gateway webhook that may fire more than once.',
                    '',
                    'The total is calculated from `items[]` and never taken from the caller.',
                ].join('\n'),
                requestBody: jsonBody(
                    {
                        type: 'object',
                        required: ['orderNumber', 'items'],
                        properties: {
                            orderNumber: {
                                type: 'string',
                                description:
                                    'Your reference. Unique; used as the invoice reference_number.',
                                example: 'HAUS-1001',
                            },
                            userId: {
                                type: 'string',
                                format: 'uuid',
                                description:
                                    'Payer as a local user. Alternative to zohoContactId or customer.',
                            },
                            zohoContactId: {
                                type: 'string',
                                description: 'Existing Books contact id, when you already have it.',
                            },
                            customer: {
                                type: 'object',
                                description:
                                    'Details to find or create a contact by email. Use when the payer is not a local user.',
                                required: ['name', 'email'],
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string', format: 'email' },
                                    phone: { type: 'string' },
                                },
                            },
                            description: { type: 'string', example: 'Order #1001' },
                            notes: { type: 'string', description: 'Written onto the invoice.' },
                            items: {
                                type: 'array',
                                minItems: 1,
                                items: {
                                    type: 'object',
                                    required: ['description', 'unitPrice'],
                                    properties: {
                                        type: { type: 'string', example: 'MEETING_ROOM' },
                                        description: {
                                            type: 'string',
                                            example: 'Meeting Room - 2 hours',
                                        },
                                        quantity: { type: 'number', default: 1, example: 2 },
                                        unitPrice: { type: 'number', example: 500 },
                                        itemId: {
                                            type: 'string',
                                            description:
                                                'Optional Books catalogue item for this line.',
                                        },
                                    },
                                },
                            },
                            payment: {
                                type: 'object',
                                description: 'What the gateway already collected.',
                                properties: {
                                    reference: {
                                        type: 'string',
                                        description:
                                            'Gateway payment id, stored on the Zoho payment.',
                                        example: 'pay_RzpTest12345',
                                    },
                                    mode: {
                                        type: 'string',
                                        default: 'others',
                                        description:
                                            'A mode the organization accepts: cash, check, creditcard, banktransfer, bankremittance, autotransaction, others, or a custom one.',
                                        example: 'creditcard',
                                    },
                                    date: {
                                        type: 'string',
                                        example: '2026-09-28',
                                        description: 'yyyy-mm-dd. Defaults to the invoice date.',
                                    },
                                    amount: {
                                        type: 'number',
                                        description:
                                            'Defaults to the invoice total, covering any tax Zoho adds. Pass it only to record a part payment, which leaves the invoice partially paid.',
                                    },
                                },
                            },
                        },
                    },
                    {
                        orderNumber: 'HAUS-1001',
                        userId: '0e50f914-032b-42e3-b061-5998c14885f0',
                        description: 'Order #1001',
                        items: [
                            {
                                type: 'MEETING_ROOM',
                                description: 'Meeting Room - 2 hours',
                                quantity: 2,
                                unitPrice: 500,
                            },
                            {
                                type: 'PRINT',
                                description: 'Printing - 20 pages',
                                quantity: 20,
                                unitPrice: 5,
                            },
                            { type: 'FOOD', description: 'Coffee', quantity: 2, unitPrice: 100 },
                        ],
                        payment: { reference: 'pay_RzpTest12345', mode: 'creditcard' },
                    },
                ),
                responses: {
                    201: jsonResponse(
                        'Recorded and settled in Zoho Books',
                        envelope(ORDER, 'Order recorded in Zoho Books and marked paid'),
                    ),
                    200: jsonResponse(
                        'This orderNumber was already recorded; nothing was created',
                        envelope(ORDER, 'Order was already recorded in Zoho Books'),
                    ),
                    500: jsonResponse('Validation or Zoho error', ERROR_RESPONSE),
                },
            },
        },
        '/api/books/orders/{orderNumber}': {
            get: {
                tags: ['Books'],
                summary: 'Fetch a recorded order by your order number',
                parameters: [
                    pathParam('orderNumber', 'The reference you supplied, e.g. HAUS-1001.'),
                ],
                responses: {
                    200: jsonResponse(
                        'The stored order and its Zoho ids',
                        envelope(ORDER, 'Order fetched'),
                    ),
                },
            },
        },

        '/api/sign/templates': {
            get: {
                tags: ['Zoho Sign'],
                summary: 'List or find signature templates',
                description:
                    '`name` returns the single exact match with full details (actions and fields); `search` matches partially; neither returns the list.',
                parameters: [
                    {
                        name: 'name',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Exact template name.',
                        example: 'HAUS+ Membership Agreement.docx',
                    },
                    {
                        name: 'search',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Partial name.',
                    },
                    { name: 'rowCount', in: 'query', schema: { type: 'integer', default: 100 } },
                    { name: 'startIndex', in: 'query', schema: { type: 'integer', default: 1 } },
                ],
                responses: {
                    200: jsonResponse(
                        'Templates, or the single named one',
                        envelope(
                            { type: 'array', items: SIGN_TEMPLATE },
                            'Templates fetched from Zoho Sign',
                        ),
                    ),
                    500: jsonResponse('No exact match, or a Zoho error', ERROR_RESPONSE),
                },
            },
        },
        '/api/sign/templates/{id}': {
            get: {
                tags: ['Zoho Sign'],
                summary: 'Template details, including recipient actions and fields',
                description:
                    'The actions are what sending needs: each carries an action_id, its signing order, and the recipient to fill in. An action with a blank name and email is an open slot for your signer.',
                parameters: [pathParam('id', 'Zoho Sign template_id, e.g. 619865000000047066.')],
                responses: {
                    200: jsonResponse(
                        'The template',
                        envelope(SIGN_TEMPLATE, 'Template fetched from Zoho Sign'),
                    ),
                    500: jsonResponse('Invalid template id, or a Zoho error', ERROR_RESPONSE),
                },
            },
        },
        '/api/sign/agreements': {
            post: {
                tags: ['Zoho Sign'],
                summary: 'Create an agreement from a template and send it for signature',
                description: [
                    'One call per agreement. The template is read first — action ids, roles and',
                    'signing order come from Zoho, not from this request — then the document is',
                    'created and sent. The template itself is never modified.',
                    '',
                    '**Who signs what.** Admin values go in `fields` / `dateFields` and are',
                    'pre-filled. Leave the signature and sign-date fields out: each signatory',
                    'completes those through the link Zoho emails them.',
                    '',
                    '**Every mandatory pre-fill field must have a value.** Zoho rejects the whole',
                    'request otherwise, so the request is checked first and fails with the list of',
                    'missing field names before anything is created.',
                    '',
                    "**Field keys** accept either the template's `field_name`",
                    '(e.g. `workspace_address`) or its `field_label`; each value is sent under both,',
                    'since Zoho matches on the label. A key matching no field is passed through',
                    'and logged.',
                    '',
                    '**Dates** are converted to the format configured on the field, so send plain',
                    '`yyyy-mm-dd` and `membership_start_date` arrives as `Oct 01 2026`.',
                    '',
                    '**Signing order** comes from the template. With `is_sequential: false` both',
                    'parties are emailed at once, whatever the signing orders say.',
                ].join('\n'),
                requestBody: jsonBody(
                    {
                        type: 'object',
                        required: ['templateId'],
                        properties: {
                            templateId: { type: 'string', example: '619865000000047066' },
                            member: {
                                type: 'object',
                                description:
                                    'The member company signatory — the open slot on the template.',
                                required: ['name', 'email'],
                                properties: {
                                    name: { type: 'string', example: 'Member Test' },
                                    email: { type: 'string', format: 'email' },
                                },
                            },
                            haus: {
                                type: 'object',
                                description:
                                    'Overrides the HAUS+ signatory. Defaults to whoever the template names.',
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string', format: 'email' },
                                },
                            },
                            recipients: {
                                type: 'array',
                                description:
                                    'Target an action precisely, by action id or exact role. Wins over haus/member.',
                                items: {
                                    type: 'object',
                                    required: ['name', 'email'],
                                    properties: {
                                        actionId: { type: 'string', example: '619865000000047081' },
                                        role: {
                                            type: 'string',
                                            example: 'Member Company Authorized Signatory',
                                        },
                                        name: { type: 'string' },
                                        email: { type: 'string', format: 'email' },
                                    },
                                },
                            },
                            fields: {
                                type: 'object',
                                description: [
                                    'Text and dropdown values to pre-fill, keyed by field name or label.',
                                    'For template 619865000000047066 that is the 43 fields shown in the',
                                    'example — all of its sender pre-fill fields except',
                                    '`membership_start_date`, which is a date and belongs in `dateFields`.',
                                    'The signature and sign-date fields stay with the signatories.',
                                    '',
                                    '`dedicated_vlan`, `dedicated_firewall` and `dedicated_bandwidth` are',
                                    'dropdowns: the value must be exactly "Yes" or "No".',
                                ].join('\n'),
                                additionalProperties: { type: 'string' },
                            },
                            dateFields: {
                                type: 'object',
                                description:
                                    'Date values to pre-fill. `membership_start_date` belongs here, not in `fields`.',
                                additionalProperties: { type: 'string' },
                            },
                            booleanFields: {
                                type: 'object',
                                description: 'Checkbox values to pre-fill.',
                                additionalProperties: { type: 'boolean' },
                            },
                            notes: { type: 'string', description: 'Note shown to the signers.' },
                            quickSend: {
                                type: 'boolean',
                                default: true,
                                description:
                                    'Omit it (or send true) to email both signatories immediately — the normal case. Send false only to leave a draft in Zoho Sign while testing, then release it with POST /api/sign/requests/{id}/send.',
                            },
                        },
                    },
                    {
                        templateId: '619865000000047066',
                        member: { name: 'Member Test', email: 'client@company.com' },
                        fields: {
                            // HAUS+ signatory (signature and sign date are left to the signer)
                            haus_signatory_name: 'John Doe',
                            haus_signatory_title: 'Managing Director',
                            // Member company
                            member_company_legal_name: 'ABC Limited',
                            member_company_corporate_id: 'C-123456',
                            member_company_trade_name: 'ABC',
                            member_company_nature_of_business: 'Software development',
                            member_company_gst_number: 'GST-987654321',
                            member_company_broker_details: 'N/A',
                            // Workspace
                            workspace_address: 'Level 4, Gulshan Avenue, Dhaka',
                            workspace_suite_no: 'Suite 402',
                            workspace_capacity: '12',
                            workspace_billable_work_units: '12 desks',
                            // Term and fees
                            commitment_term: '12 months',
                            notice_period: '60 days',
                            basic_membership_fee: '25000',
                            annual_increment_basic_fee: '5% per annum',
                            service_retainer: '50000',
                            setup_fee: '10000',
                            payment_mode: 'Bank transfer',
                            // Included credits
                            conference_room_credits: '20 hours',
                            printing_bw_credits: '500 pages',
                            printing_color_credits: '100 pages',
                            overage_conference_room_credit: 'BDT 500 per hour',
                            overage_printing_credit_bnw: 'BDT 2 per page',
                            overage_printing_credit_color: 'BDT 10 per page',
                            // Custom work and services
                            custom_work_description: 'Additional partitioning',
                            custom_work_cost: '15000',
                            hvac_charges: 'At actuals',
                            it_services_charges: '3000 per month',
                            security_access_charges: '500 per access card',
                            // Dedicated IT — dropdowns, exactly "Yes" or "No"
                            dedicated_vlan: 'Yes',
                            dedicated_firewall: 'No',
                            dedicated_bandwidth: 'Yes',
                            // Miscellaneous
                            parking_spots: '2',
                            parking_fees: '3000 per spot',
                            additional_fees: 'None',
                            annual_increment_miscellaneous_fees: '5% per annum',
                            registered_office_permitted: 'Yes',
                            additional_service_retainer: 'None',
                            // HAUS+ contact person on the agreement
                            haus_employee_name: 'Abul Basar',
                            haus_employee_designation: 'Community Manager',
                            haus_employee_contact: '+8801700000000',
                            haus_employee_email: 'abul@hausplus.com',
                        },
                        dateFields: { membership_start_date: '2026-10-01' },
                        notes: 'Membership agreement for Order HAUS-1001',
                    },
                ),
                responses: {
                    201: jsonResponse(
                        'Created — sent, or left as a draft',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    requestId: { type: 'string', example: '619865000000050010' },
                                    requestName: { type: 'string' },
                                    requestStatus: { type: 'string', example: 'draft' },
                                    templateId: { type: 'string' },
                                    templateName: { type: 'string' },
                                    sent: { type: 'boolean' },
                                    prefilledFields: { type: 'integer', example: 6 },
                                    recipients: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                actionId: { type: 'string' },
                                                role: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' },
                                            },
                                        },
                                    },
                                },
                            },
                            'Agreement created and sent for signature',
                        ),
                    ),
                    500: jsonResponse(
                        'A mandatory pre-fill field has no value, a template role has no recipient, or a Zoho error',
                        ERROR_RESPONSE,
                    ),
                },
            },
        },
        '/api/sign/requests/{id}/send': {
            post: {
                tags: ['Zoho Sign'],
                summary: 'Send a draft agreement for signature',
                description: [
                    'Submits a draft created with `quickSend: false`. **Zoho emails every',
                    'signatory the moment this returns, and that cannot be undone** — recall the',
                    'request in Zoho Sign if it goes out in error.',
                    '',
                    'Only a draft can be sent; anything already in progress is rejected.',
                    'Passing `quickSend: true` when creating skips this step entirely.',
                ].join('\n'),
                parameters: [pathParam('id', 'Zoho Sign request_id, e.g. 619865000000051010.')],
                responses: {
                    200: jsonResponse(
                        'Sent — signatories have been emailed',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    requestId: { type: 'string' },
                                    requestName: { type: 'string' },
                                    requestStatus: { type: 'string', example: 'inprogress' },
                                    sent: { type: 'boolean', example: true },
                                    recipients: { type: 'array', items: { type: 'object' } },
                                },
                            },
                            'Agreement sent for signature',
                        ),
                    ),
                    500: jsonResponse('Not a draft, or a Zoho error', ERROR_RESPONSE),
                },
            },
        },
        '/api/sign/requests/{id}': {
            get: {
                tags: ['Zoho Sign'],
                summary: 'Signature request status, per signatory',
                description:
                    'Each recipient reports its own status — NOACTION until that person signs.',
                parameters: [pathParam('id', 'Zoho Sign request_id from the create call.')],
                responses: {
                    200: jsonResponse(
                        'The request and its signatories',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    requestId: { type: 'string' },
                                    requestName: { type: 'string' },
                                    requestStatus: {
                                        type: 'string',
                                        example: 'inprogress',
                                        description: 'draft, inprogress, completed, declined …',
                                    },
                                    recipients: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                actionId: { type: 'string' },
                                                role: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' },
                                                status: { type: 'string', example: 'NOACTION' },
                                            },
                                        },
                                    },
                                },
                            },
                            'Signature request fetched',
                        ),
                    ),
                },
            },
        },

        '/api/billing/webhook': {
            post: {
                tags: ['Webhooks'],
                summary: 'Zoho webhook receiver (source of truth for payments)',
                description: [
                    'Register this URL in Zoho for `payment_thankyou`, `invoice_created`,',
                    '`subscription_created` and `subscription_cancelled`.',
                    '',
                    'Zoho does not sign webhooks, so the shared secret travels in the query string.',
                    'Deliveries are stored before processing and are idempotent on event id and',
                    'payment id. An order is only marked PAID after re-reading the invoice or link',
                    'status from Zoho — the request body is never trusted on its own.',
                ].join('\n'),
                parameters: [
                    {
                        name: 'secret',
                        in: 'query',
                        required: true,
                        schema: { type: 'string' },
                        description: 'Must equal ZOHO_WEBHOOK_SECRET.',
                    },
                    {
                        name: 'event_type',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'Optional fallback when the body carries no event_type.',
                    },
                ],
                requestBody: jsonBody(
                    {
                        type: 'object',
                        description:
                            'Entities may arrive under data, payload, or at the top level.',
                        properties: {
                            event_id: { type: 'string' },
                            event_type: { type: 'string', example: 'payment_thankyou' },
                            data: { type: 'object' },
                        },
                    },
                    {
                        event_id: 'evt-1',
                        event_type: 'payment_thankyou',
                        data: {
                            payment: {
                                payment_id: 'PAY-1',
                                customer_id: '1344209000000104002',
                                amount: 1300,
                                invoices: [
                                    { invoice_id: '1344209000000137021', amount_applied: 1300 },
                                ],
                            },
                        },
                    },
                ),
                responses: {
                    200: jsonResponse(
                        'Processed, or already seen',
                        envelope(
                            {
                                type: 'object',
                                properties: {
                                    eventType: { type: 'string' },
                                    duplicate: { type: 'boolean' },
                                },
                            },
                            'Webhook processed',
                        ),
                    ),
                    401: jsonResponse('Wrong or missing secret', ERROR_RESPONSE),
                },
            },
        },
        '/api/billing/return': {
            get: {
                tags: ['Webhooks'],
                summary: 'Where Zoho returns the payer after checkout',
                description:
                    'Deliberately neutral: the redirect is never treated as proof of payment. The webhook decides.',
                responses: {
                    200: jsonResponse(
                        'Checking state',
                        envelope(
                            {
                                type: 'object',
                                properties: { status: { type: 'string', example: 'checking' } },
                            },
                            'Checking payment status.',
                        ),
                    ),
                },
            },
        },
    },
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {
            Order: ORDER,
            OrderItem: ORDER_ITEM,
            SignTemplate: SIGN_TEMPLATE,
            Error: ERROR_RESPONSE,
        },
    },
}
