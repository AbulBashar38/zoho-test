import { Router } from 'express'
import { BooksController } from './books.controller'

const router = Router()

// Record a paid order in Zoho Books. Idempotent on orderNumber.
router.post('/orders', BooksController.recordOrder)
router.get('/orders/:orderNumber', BooksController.getOrder)

export const BooksRoutes = router
