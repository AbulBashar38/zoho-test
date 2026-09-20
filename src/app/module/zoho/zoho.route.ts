import { Router } from 'express'
import config from '../../config'
import { ZohoController } from './zoho.controller'

const router = Router()

router.get('/oauth/callback', ZohoController.oauthCallback)
router.post('/authorize', ZohoController.authorize)

// Integration test endpoints. They create real accounting records in Zoho,
// so they are never exposed in production.
if (config.node_env !== 'production') {
    router.get('/test', ZohoController.testConnection)
    router.post('/test', ZohoController.runIntegrationTest)
}

export const ZohoRoutes = router
