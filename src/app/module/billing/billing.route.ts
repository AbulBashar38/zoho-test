import { Router } from 'express'
import { BillingController } from './billing.controller'

const router = Router()

// Called by Zoho.
router.post('/webhook', BillingController.webhook)
router.get('/return', BillingController.paymentReturn)

// Called by the app.
router.post('/subscribe', BillingController.subscribe)
router.post('/invoices/:id/pay', BillingController.payInvoice)
router.get('/invoices', BillingController.listInvoices)

export const BillingRoutes = router
