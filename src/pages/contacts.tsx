import { useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useContacts } from '@/hooks/use-contacts'
import { useToast } from '@/components/ui/toast'
import type { Contact } from '@/hooks/use-contacts'

const ROLE_COLORS: Record<string, string> = {
  agent: 'bg-blue-600', contractor: 'bg-orange-600', lender: 'bg-green-600',
  attorney: 'bg-purple-600', partner: 'bg-yellow-600',
}

export default function ContactsPage() {
  const { contacts, loading, addContact } = useContacts()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [newContact, setNewContact] = useState({ name: '', role: 'agent', email: '', phone: '', company: '', notes: '' })
  const [dialogOpen, setDialogOpen] = useState(false)

  const isSearching = search.trim().length > 0
  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase()) ||
    c.role?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAdd() {
    if (!newContact.name.trim()) {
      toast('Name is required', 'error')
      return
    }
    await addContact(newContact as Omit<Contact, 'id'>)
    setNewContact({ name: '', role: 'agent', email: '', phone: '', company: '', notes: '' })
    setDialogOpen(false)
    toast('Contact added', 'success')
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Contacts</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button />}>+ Add Contact</DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                <select className="w-full rounded-md border p-2 bg-background" value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}>
                  <option value="agent">Agent</option><option value="contractor">Contractor</option>
                  <option value="lender">Lender</option><option value="attorney">Attorney</option>
                  <option value="partner">Partner</option>
                </select>
                <Input placeholder="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                <Input placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                <Input placeholder="Company" value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} />
                <Button onClick={handleAdd} disabled={!newContact.name}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} />

        {loading ? <p>Loading...</p> : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            {isSearching ? 'No contacts match your search.' : 'No contacts yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4 flex justify-between items-start">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    {c.company && <p className="text-sm text-muted-foreground">{c.company}</p>}
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  </div>
                  {c.role && <Badge className={ROLE_COLORS[c.role] || ''}>{c.role}</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
