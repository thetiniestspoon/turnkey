import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmojiPinPad } from './emoji-pin-pad'
import { useAuth } from '@/contexts/auth-context'
import { useToast } from '@/components/ui/toast'

export function EmojiPinSettings() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { session } = useAuth()
  const { toast } = useToast()

  const handleUpdatePin = async (pin: string[]) => {
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emoji-pin-update`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ new_emoji_pin: pin.join('') }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to update PIN')
        return
      }

      setSuccess(true)
      toast('Emoji PIN updated! 🦝')
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
      }, 1500)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); setSuccess(false) }}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Settings" />}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Emoji PIN 🦝</DialogTitle>
          <DialogDescription>
            Choose a new 4-emoji sequence to sign in without email.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-4xl">🎉🦝</div>
            <p className="text-sm text-muted-foreground">PIN updated!</p>
          </div>
        ) : (
          <EmojiPinPad
            onSubmit={handleUpdatePin}
            loading={loading}
            error={error}
            submitLabel="Set New PIN 🔑"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
