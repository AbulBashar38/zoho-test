import { prisma } from '../../app/lib/prisma'
import { zohoClient } from './zoho-client'

type TZohoContact = {
    contact_id: string
    contact_name: string
}

type TCreateZohoContactPayload = {
    name: string
    email: string
    phone?: string | null
}

export const createZohoContact = async ({ name, email, phone }: TCreateZohoContactPayload) => {
    const response = await zohoClient.post<{ contact: TZohoContact }>('/contacts', {
        contact_name: name,
        contact_type: 'customer',
        // Zoho Books v3 takes email/phone on the contact person, not on the contact itself.
        contact_persons: [
            {
                first_name: name,
                email,
                phone: phone ?? undefined,
                is_primary_contact: true,
            },
        ],
    })

    return response.data.contact
}

// Books filters contacts by the primary contact person's email, so a repeat order for the
// same customer reuses the existing contact instead of failing on a duplicate name.
export const findZohoContactByEmail = async (email: string) => {
    const response = await zohoClient.get<{ contacts: TZohoContact[] }>('/contacts', {
        params: { email: email.trim() },
    })

    return response.data.contacts?.[0]
}

export const getOrCreateZohoContactByDetails = async (params: {
    name: string
    email: string
    phone?: string | null
}) => {
    const existing = await findZohoContactByEmail(params.email)

    if (existing) return existing.contact_id

    const contact = await createZohoContact(params)

    return contact.contact_id
}

export const getOrCreateZohoContact = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { patient: true },
    })

    if (!user) {
        throw new Error(`User not found: ${userId}`)
    }

    if (user.zohoContactId) {
        return user.zohoContactId
    }

    const contact = await createZohoContact({
        name: user.name,
        email: user.email,
        phone: user.patient?.contactNumber,
    })

    await prisma.user.update({
        where: { id: user.id },
        data: { zohoContactId: contact.contact_id },
    })

    return contact.contact_id
}
