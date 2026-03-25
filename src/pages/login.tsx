import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/auth-context'
import { EmojiPinPad } from '@/components/auth/emoji-pin-pad'
import { supabase } from '@/lib/supabase'

const ALLOWED_EMAILS = [
  'shawnjordanetal@gmail.com',
  'theodorelawson@gmail.com',
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinLoading, setPinLoading] = useState(false)
  const { signInWithMagicLink } = useAuth()

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!ALLOWED_EMAILS.includes(email.toLowerCase().trim())) {
      setError('Sorry, this app is invite-only. Your email is not on the guest list.')
      return
    }

    const { error } = await signInWithMagicLink(email)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  const handlePinSubmit = async (pin: string[]) => {
    setPinError(null)
    setPinLoading(true)

    try {
      const pinString = pin.join('')

      // Call the Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emoji-pin-auth`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ emoji_pin: pinString }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setPinError(data.error || 'Authentication failed')
        return
      }

      // Use the token to verify OTP and establish session
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      })

      if (verifyError) {
        setPinError('Session verification failed. Try the email option.')
      }
      // On success, the auth state change listener in auth-context will redirect
    } catch {
      setPinError('Connection error. Please try again.')
    } finally {
      setPinLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-5xl mb-2">🦝</div>
          <CardTitle className="text-2xl">Turnkey</CardTitle>
          <p className="text-muted-foreground text-sm">
            Your raccoon-powered deal scout
          </p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">📬🦝</div>
              <p className="text-muted-foreground">
                Magic link sent! Check your inbox.
              </p>
              <p className="text-xs text-muted-foreground">
                Our raccoon hand-delivered it. Should arrive momentarily.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSent(false)}
                className="text-xs"
              >
                Back to login
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="pin">
              <TabsList className="w-full">
                <TabsTrigger value="pin" className="flex-1">Emoji PIN</TabsTrigger>
                <TabsTrigger value="email" className="flex-1">Email</TabsTrigger>
              </TabsList>

              <TabsContent value="pin" className="pt-4">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground text-center">
                    Tap your secret emoji sequence to sign in
                  </p>
                  <EmojiPinPad
                    onSubmit={handlePinSubmit}
                    loading={pinLoading}
                    error={pinError}
                  />
                </div>
              </TabsContent>

              <TabsContent value="email" className="pt-4">
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <Button type="submit" className="w-full">
                    Let Me In 🦝
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
