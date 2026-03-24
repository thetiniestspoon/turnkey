import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'

export interface Contact {
  id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
}

export function useContacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  const fetchContacts = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('contacts')
      .select('*').eq('user_id', user.id).order('name')
    setContacts(data || [])
    setLoading(false)
  }, [user])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function addContact(contact: Omit<Contact, 'id'>) {
    if (!user) return
    const { error } = await supabase.from('contacts').insert({ ...contact, user_id: user.id })
    if (!error) await fetchContacts()
    return error
  }

  async function updateContact(id: string, updates: Partial<Contact>) {
    const { error } = await supabase.from('contacts').update(updates).eq('id', id)
    if (!error) await fetchContacts()
    return error
  }

  async function linkContact(contactId: string, propertyId?: string, pipelineId?: string) {
    const { error } = await supabase.from('contact_links').insert({
      contact_id: contactId, property_id: propertyId, pipeline_id: pipelineId,
    })
    return error
  }

  return { contacts, loading, addContact, updateContact, linkContact, refetch: fetchContacts }
}
