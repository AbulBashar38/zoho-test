import { Router } from 'express'
import { BillingController } from './billing.controller'

const router = Router()

// Called by Zoho.
router.post('/webhook', BillingController.webhook)
router.get('/return', BillingController.paymentReturn)

// Called by the app.
router.post('/subscribe', BillingController.subscribe)

// Item lookup: ?name= for the exact match, ?search= for a broader list.
router.get('/items', BillingController.findItems)
router.get('/items/:id', BillingController.getItem)

// Product lookup: ?name= for the exact match, otherwise the full list.
router.get('/products', BillingController.findProducts)
router.get('/products/:id', BillingController.getProduct)
router.post('/invoices/:id/pay', BillingController.payInvoice)
router.get('/invoices', BillingController.listInvoices)

export const BillingRoutes = router
