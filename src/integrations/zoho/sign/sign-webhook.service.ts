import { prisma } from '../../../app/lib/prisma'
import { captureAgreement } from './sign-capture.service'

// Zoho Sign's payload shape is not documented in the collection we have, so the request id
// is hunted for wherever it may sit rather than assumed.
const findRequestId = (payload: unknown, depth = 0): string | undefined => {
    if (!payload || typeof payload !== 'object' || depth > 6) return undefined

    const record = payload as Record<string, unknown>

    for (const key of ['request_id', 'requestId', 'requestID']) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value.trim()
        if (typeof value === 'number') return String(value)
    }

    for (const value of Object.values(record)) {
        const found = findRequestId(value, depth + 1)
        if (found) return found
    }

    return undefined
}

const findEventType = (payload: Record<string, unknown>, fallback?: string) => {
    for (const key of ['operation_type', 'event_type', 'notification_type', 'action']) {
        const value = payload[key]
        if (typeof value === 'string' && value) return value
    }

    return fallback ?? 'unknown'
}

// Every delivery is stored, then the agreement is re-read from Zoho and saved. The body is
// only used to learn which request changed — never as the source of truth.
export const handleZohoSignWebhook = async (
    payload: Record<string, unknown>,
    eventTypeFromQuery?: string,
) => {
    const eventType = findEventType(payload, eventTypeFromQuery)
    const requestId = findRequestId(payload)

    console.log('sign webhook: event', eventType, '| request', requestId ?? 'not found in payload')

    const record = await prisma.zohoWebhookEvent.create({
        data: {
            eventType: `sign:${eventType}`,
            payload: payload as object,
        },
    })

    if (!requestId) {
        const message = 'No request_id found anywhere in the webhook payload'

        await prisma.zohoWebhookEvent.update({
            where: { id: record.id },
            data: { error: message },
        })

        throw new Error(message)
    }

    try {
        const agreement = await captureAgreement(requestId)

        await prisma.zohoWebhookEvent.update({
            where: { id: record.id },
            data: { processed: true },
        })

        return { eventType, requestId, status: agreement.status, storedValues: agreement.fields.length }
    } catch (error) {
        await prisma.zohoWebhookEvent.update({
            where: { id: record.id },
            data: { error: (error as Error).message },
        })

        throw error
    }
}
