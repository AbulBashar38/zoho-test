import { Router } from 'express'
import { SignController } from './sign.controller'

const router = Router()

router.get('/templates', SignController.listTemplates)
router.get('/templates/:id', SignController.getTemplate)

// Create an agreement from a template, then track it.
router.post('/agreements', SignController.createAgreement)
router.get('/requests/:id', SignController.getRequest)
// Sends a draft to its signatories.
router.post('/requests/:id/send', SignController.sendRequest)

export const SignRoutes = router
