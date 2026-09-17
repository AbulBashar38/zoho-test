# Zoho Books API Integration — Minimal Backend Test

This project is a **minimal integration test** for verifying that Zoho Books API v3 can be successfully integrated into an existing Node.js + Express + TypeScript + Prisma + PostgreSQL backend.

The existing backend already has:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Environment-based database configuration

Do **not** redesign the existing backend architecture.

Do **not** create a production billing system.

Do **not** create a queue, worker, subscription module, order module, payment module, or complex domain architecture.

The only goal is:

> Verify that the backend can authenticate with Zoho Books and successfully create/use a Contact, Item, Invoice, and Customer Payment.

---

# 1. Goal

Build a minimal Zoho Books integration with this flow:

```text
Test API Request
      ↓
Find/Create Zoho Contact
      ↓
Find/Create Zoho Item
      ↓
Create Zoho Invoice
      ↓
Create Zoho Customer Payment
      ↓
Return Zoho IDs
```

The purpose is only to prove that the Zoho Books integration works correctly.

---

# 2. Existing Project

Assume the project already contains something similar to:

```text
src/
├── app.ts
├── server.ts
├── prisma/
└── ...
```

The existing PostgreSQL connection is already configured through environment variables.

Do not modify the existing database connection setup.

Use the existing Prisma client.

---

# 3. Zoho Books API

Use **Zoho Books API v3**.

Official documentation:

- Overview:
  https://www.zoho.com/books/api/v3/introduction/overview.md
- OAuth:
  https://www.zoho.com/books/api/v3/oauth/
- Contacts:
  https://www.zoho.com/books/api/v3/contacts/
- Items:
  https://www.zoho.com/books/api/v3/items/
- Invoices:
  https://www.zoho.com/books/api/v3/invoices/
- Customer Payments:
  https://www.zoho.com/books/api/v3/customer-payments/

The implementation must follow the current Zoho Books API v3 documentation.

---

# 4. Environment Variables

Add the following environment variables:

```env
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_ORGANIZATION_ID=
ZOHO_API_DOMAIN=https://www.zohoapis.com
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.com
```

The exact API domain depends on the Zoho data center.

Do not hardcode credentials.

Do not expose these values to the frontend.

Never commit `.env` to Git.

---

# 5. OAuth Concept

Zoho Books uses OAuth 2.0.

For this test application, assume the Zoho OAuth setup has already been completed and a refresh token is available.

The backend should use:

```text
ZOHO_REFRESH_TOKEN
```

to obtain an access token.

The application must **not** require manually entering an access token for every request.

Flow:

```text
Refresh Token
      ↓
Zoho OAuth Token API
      ↓
Access Token
      ↓
Zoho Books API
```

Access tokens expire, so the implementation must automatically refresh the access token when necessary.

---

# 6. OAuth Token Endpoint

Use:

```http
POST {ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token
```

with:

```text
refresh_token
client_id
client_secret
grant_type=refresh_token
```

Example:

```ts
const response = await axios.post(
  `${process.env.ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token`,
  null,
  {
    params: {
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    },
  },
);
```

The response contains:

```json
{
  "access_token": "...",
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Use the returned access token for Zoho Books requests.

---

# 7. Create Minimal Zoho Integration Structure

Only create the following files:

```text
src/
└── integrations/
    └── zoho/
        ├── zoho-auth.ts
        ├── zoho-client.ts
        ├── zoho-contact.ts
        ├── zoho-item.ts
        ├── zoho-invoice.ts
        ├── zoho-payment.ts
        └── zoho-test.service.ts
```

Do not create additional application modules unless absolutely necessary.

---

# 8. `zoho-auth.ts`

Implement:

```ts
getZohoAccessToken();
```

Responsibilities:

1. Read the refresh token from environment variables.
2. Request an access token from Zoho.
3. Cache the access token in memory.
4. Track expiration time.
5. Reuse the existing token while it is valid.
6. Refresh it automatically when it expires.

Example behavior:

```text
API Request
    ↓
getZohoAccessToken()
    ↓
Token exists and valid?
    ├── YES → return existing token
    │
    └── NO → refresh using refresh_token
                  ↓
              save token
                  ↓
              return token
```

Keep this implementation simple because this is only an integration test.

---

# 9. `zoho-client.ts`

Create a reusable Zoho HTTP client.

Use Axios.

Base URL:

```text
{ZOHO_API_DOMAIN}/books/v3
```

Every request must include:

```http
Authorization: Zoho-oauthtoken ACCESS_TOKEN
Content-Type: application/json
```

Every Books API request must include:

```text
organization_id
```

Example:

```ts
const response = await zohoClient.post("/contacts", payload);
```

The client should automatically add:

```text
organization_id=ZOHO_ORGANIZATION_ID
```

Do not repeat authentication code in every service.

---

# 10. First Test — Organizations

Before creating anything, implement a simple test:

```http
GET /organizations
```

through the Zoho client.

Create a test endpoint:

```http
GET /api/zoho/test
```

This endpoint should call:

```http
GET /organizations
```

and return the Zoho response.

Expected result:

```json
{
  "success": true,
  "data": {
    "code": 0,
    "message": "success",
    "organizations": [...]
  }
}
```

This confirms:

```text
OAuth
+
Access Token
+
API Domain
+
Organization ID
+
Zoho API
```

are working.

---

# 11. Prisma User Schema

There is already a user schema in the project.

Only add a Zoho contact ID if it does not already exist.

Example:

```prisma
model User {
  id            String   @id @default(uuid())

  name          String
  email         String
  phone         String?

  zohoContactId String?  @unique

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Do not add order, payment, subscription, billing-cycle, or accounting models.

The purpose of `zohoContactId` is only to test the mapping:

```text
Application User
       ↓
zohoContactId
       ↓
Zoho Contact
```

Run the normal Prisma migration after changing the schema.

---

# 12. Contact Integration

Create:

```text
zoho-contact.ts
```

Implement:

```ts
createZohoContact();
```

Use:

```http
POST /contacts
```

Basic payload:

```json
{
  "contact_name": "Test User",
  "contact_type": "customer",
  "email": "test@example.com",
  "phone": "01700000000"
}
```

The response should contain a Zoho contact ID.

Example:

```json
{
  "contact_id": "460000000026049"
}
```

After successfully creating the contact:

```text
Zoho contact_id
       ↓
User.zohoContactId
       ↓
PostgreSQL
```

---

# 13. Get-or-create Contact

The test service must not create duplicate contacts every time.

Implement:

```ts
getOrCreateZohoContact(userId);
```

Logic:

```text
Find User
   ↓
Does user.zohoContactId exist?
   │
   ├── YES
   │    ↓
   │  Return existing Zoho contact ID
   │
   └── NO
        ↓
     Create Zoho Contact
        ↓
     Save contact_id to User
        ↓
     Return contact_id
```

For this test project, use the local `zohoContactId` mapping as the primary way of determining whether the contact has already been created.

---

# 14. Item Integration

Create:

```text
zoho-item.ts
```

Implement:

```ts
createZohoItem();
```

Use the Zoho Books Items API.

Create one test item, for example:

```text
Test Monthly Workspace
```

or:

```text
Test Coffee
```

The purpose is only to verify that the backend can create and use a Zoho item.

If the existing Prisma project has a product/service model, add:

```prisma
zohoItemId String? @unique
```

to that existing model.

Do not create a complete product-management feature.

---

# 15. Get-or-create Item

Implement:

```ts
getOrCreateZohoItem();
```

Logic:

```text
Does local product/service have zohoItemId?
       │
       ├── YES → return it
       │
       └── NO
            ↓
       Create Zoho Item
            ↓
       Save item_id
            ↓
       Return item_id
```

This prevents creating duplicate Zoho items during repeated tests.

---

# 16. Invoice Integration

Create:

```text
zoho-invoice.ts
```

Implement:

```ts
createZohoInvoice();
```

Use:

```http
POST /invoices
```

The invoice must contain:

```text
customer_id
line_items
```

Example:

```json
{
  "customer_id": "460000000026049",
  "line_items": [
    {
      "item_id": "460000000012345",
      "quantity": 1,
      "rate": 1000
    }
  ],
  "reference_number": "TEST-INVOICE-001",
  "notes": "Zoho API integration test"
}
```

The actual `customer_id` and `item_id` must come from the previous API calls.

Do not hardcode actual Zoho IDs.

---

# 17. Save Invoice ID

The invoice response will contain a Zoho invoice ID.

For the test project, this can simply be returned in the API response.

If there is an existing test/order-like model available, it can also be stored there.

Do not create a complete order system just for this test.

---

# 18. Customer Payment Integration

Create:

```text
zoho-payment.ts
```

Implement:

```ts
createZohoCustomerPayment();
```

Use:

```http
POST /customerpayments
```

The payment should reference:

```text
customer_id
invoice_id
amount
payment reference
```

Example concept:

```json
{
  "customer_id": "460000000026049",
  "payment_mode": "Razorpay",
  "amount": 1000,
  "reference_number": "test_razorpay_payment_001",
  "invoices": [
    {
      "invoice_id": "460000000123456",
      "amount_applied": 1000
    }
  ]
}
```

Use a payment mode supported/configured by the Zoho Books organization. Do not assume an arbitrary payment-mode string will be accepted.

The purpose is to verify:

```text
Zoho Invoice
      ↓
Zoho Customer Payment
      ↓
Invoice becomes paid
```

---

# 19. Main Test Service

Create:

```text
zoho-test.service.ts
```

Implement:

```ts
runZohoTest();
```

The function should execute the complete test:

```text
1. Get test user
       ↓
2. Get/Create Zoho Contact
       ↓
3. Get/Create Zoho Item
       ↓
4. Create Zoho Invoice
       ↓
5. Create Zoho Customer Payment
       ↓
6. Return all Zoho IDs
```

Example:

```ts
const contactId = await getOrCreateZohoContact(userId);

const itemId = await getOrCreateZohoItem();

const invoice = await createZohoInvoice({
  customerId: contactId,
  itemId,
});

const payment = await createZohoCustomerPayment({
  customerId: contactId,
  invoiceId: invoice.invoice_id,
  amount: invoice.total,
});

return {
  contactId,
  itemId,
  invoiceId: invoice.invoice_id,
  paymentId: payment.payment_id,
};
```

---

# 20. Test Endpoint

Create one minimal endpoint:

```http
POST /api/zoho/test
```

Request:

```json
{
  "userId": "existing-user-id",
  "amount": 1000,
  "itemName": "Test Workspace",
  "paymentReference": "TEST-RP-001"
}
```

The endpoint should execute the entire Zoho flow.

Expected response:

```json
{
  "success": true,
  "message": "Zoho Books integration test completed",
  "data": {
    "zohoContactId": "460000000026049",
    "zohoItemId": "460000000012345",
    "zohoInvoiceId": "460000000123456",
    "zohoPaymentId": "460000000789012"
  }
}
```

---

# 21. Suggested Test Flow

After implementation:

### Test 1 — OAuth

Call:

```http
GET /api/zoho/test
```

Expected:

```text
Zoho API responds successfully
```

If this works, authentication is correct.

---

### Test 2 — Full flow

Call:

```http
POST /api/zoho/test
```

with:

```json
{
  "userId": "USER_ID",
  "amount": 1000,
  "itemName": "Test Workspace",
  "paymentReference": "TEST-RP-001"
}
```

Expected:

```text
User
 ↓
Zoho Contact
 ↓
Zoho Item
 ↓
Zoho Invoice
 ↓
Zoho Customer Payment
```

---

# 22. Expected Zoho Result

After successful execution, log in to Zoho Books and verify:

### Contacts

A customer exists:

```text
Test User
```

### Items

An item exists:

```text
Test Workspace
```

### Invoices

An invoice exists:

```text
Test Workspace
₹1,000
```

### Payments

A customer payment exists:

```text
₹1,000
```

and is applied to the invoice.

---

# 23. Error Handling

Every Zoho request must properly handle errors.

Example:

```ts
try {
  const response = await zohoClient.post("/invoices", payload);

  return response.data;
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error("Zoho API Error:", error.response?.data);
  }

  throw error;
}
```

Do not hide Zoho's response.

During this test project, return useful error information so API problems can be diagnosed quickly.

---

# 24. HTTP Status Handling

The Zoho client should distinguish at least:

```text
200/201
    ↓
Success

400
    ↓
Invalid request/payload

401
    ↓
Access token problem

403
    ↓
Permission/scope problem

404
    ↓
Resource not found

429
    ↓
Rate limit

500+
    ↓
Zoho server error
```

For this test project, sophisticated retry logic is not required.

However, errors should be logged clearly.

---

# 25. Important OAuth Rule

Never put:

```text
ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN
```

in:

- frontend code
- React
- Next.js client components
- browser localStorage
- API response
- Git repository

They must remain server-side.

---

# 26. Important Zoho ID Rule

Never assume your database ID is the Zoho ID.

Maintain explicit mappings:

```text
PostgreSQL User
    ↓
zohoContactId

PostgreSQL Product
    ↓
zohoItemId

Zoho Invoice
    ↓
zohoInvoiceId

Zoho Payment
    ↓
zohoPaymentId
```

These IDs belong to different systems.

---

# 27. Do NOT implement these things

This is intentionally a minimal integration test.

Do NOT implement:

- Full order module
- Subscription module
- Billing-cycle module
- Billing ledger
- Razorpay integration
- Razorpay webhook
- Queue
- Worker
- Redis
- Cron jobs
- Refund system
- Production accounting architecture
- Complex Zoho synchronization
- Zoho recurring invoices
- Zoho journals
- Multi-organization Zoho support
- Multi-tenant OAuth

Those belong to the production implementation later.

The only objective is:

```text
Can our Node/Express backend successfully communicate with Zoho Books?
```

---

# 28. Final Architecture

Keep the implementation small:

```text
Existing Backend
│
├── Node
├── Express
├── TypeScript
├── Prisma
└── PostgreSQL
       │
       │
       ▼
┌─────────────────────────┐
│    Zoho Integration     │
├─────────────────────────┤
│                         │
│ OAuth                   │
│    ↓                    │
│ Access Token            │
│    ↓                    │
│ Zoho Client             │
│    ↓                    │
│ Contacts                │
│    ↓                    │
│ Items                   │
│    ↓                    │
│ Invoices                │
│    ↓                    │
│ Customer Payments       │
│                         │
└─────────────────────────┘
```

---

# 29. Implementation Order

Implement in this exact order:

```text
1. Environment variables
       ↓
2. Zoho OAuth
       ↓
3. Zoho HTTP client
       ↓
4. GET /organizations
       ↓
5. User.zohoContactId
       ↓
6. Create/Get Contact
       ↓
7. Product.zohoItemId
       ↓
8. Create/Get Item
       ↓
9. Create Invoice
       ↓
10. Create Customer Payment
       ↓
11. POST /api/zoho/test
       ↓
12. Verify everything in Zoho Books
```

---

# 30. Success Criteria

The implementation is considered successful when this request:

```http
POST /api/zoho/test
```

with:

```json
{
  "userId": "existing-user-id",
  "amount": 1000,
  "itemName": "Test Workspace",
  "paymentReference": "TEST-RP-001"
}
```

successfully produces:

```text
Zoho Contact
      ↓
Zoho Item
      ↓
Zoho Invoice
      ↓
Zoho Customer Payment
```

and the API returns:

```json
{
  "success": true,
  "data": {
    "zohoContactId": "...",
    "zohoItemId": "...",
    "zohoInvoiceId": "...",
    "zohoPaymentId": "..."
  }
}
```

At that point, the Zoho Books API integration has been successfully validated.

---

# 31. Important Design Mindset

For this test project, think only in terms of:

```text
Application Data
      ↓
Zoho ID Mapping
      ↓
Zoho API
```

The application does not need to reproduce Zoho Books.

It only needs to tell Zoho:

```text
"This is my customer."
"This is my billable item."
"This is the invoice."
"This is the payment for that invoice."
```

Once this minimal integration is proven, the same services can later be connected to the real rental, food-order, Razorpay webhook, billing-cycle, and subscription logic.
