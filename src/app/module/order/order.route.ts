import { Router } from 'express'
import { OrderController } from './order.controller'

const router = Router()

// One-time Zoho invoice with the order's line items: the default collection route.
router.post('/', OrderController.createWithInvoice)
router.post('/invoice', OrderController.createWithInvoice)

// Payment link instead of an invoice, kept for comparing the two Zoho APIs.
router.post('/links', OrderController.createWithLink)

router.get('/', OrderController.list)
router.get('/number/:orderNumber', OrderController.getByNumber)
router.get('/:id', OrderController.getOne)
// Retry/refresh the Zoho invoice for an order that already exists.
router.post('/:id/invoice', OrderController.issueInvoice)
router.post('/:id/sync', OrderController.sync)
router.post('/:id/cancel', OrderController.cancel)

export const OrderRoutes = router
