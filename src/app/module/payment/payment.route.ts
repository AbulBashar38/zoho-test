import { Router } from 'express'
import { PaymentController } from './payment.controller'

const router = Router()

router.post('/links', PaymentController.createLink)
router.post('/invoice', PaymentController.createInvoiceLink)
router.get('/', PaymentController.list)
router.get('/reference/:reference', PaymentController.getByReference)
router.get('/:id', PaymentController.getOne)
router.post('/:id/sync', PaymentController.sync)
router.post('/:id/cancel', PaymentController.cancel)

export const PaymentRoutes = router
