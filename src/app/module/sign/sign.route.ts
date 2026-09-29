import { Router } from 'express'
import { SignController } from './sign.controller'

const router = Router()

// Called by Zoho when a request changes.
router.post('/webhook', SignController.webhook)

router.get('/templates', SignController.listTemplates)
router.get('/templates/:id', SignController.getTemplate)

// Create an agreement from a template, then track it.
router.post('/agreements', SignController.createAgreement)
router.get('/requests/:id', SignController.getRequest)
// Sends a draft to its signatories.
router.post('/requests/:id/send', SignController.sendRequest)

// Stored agreements: capture from Zoho, then read the signed values locally.
router.post('/requests/:id/capture', SignController.capture)
router.get('/agreements', SignController.listStored)
router.get('/agreements/:id', SignController.getStored)

export const SignRoutes = router
