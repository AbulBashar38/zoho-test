import { Router } from 'express'
import { SignController } from './sign.controller'

const router = Router()

router.get('/templates', SignController.listTemplates)
router.get('/templates/:id', SignController.getTemplate)

export const SignRoutes = router
