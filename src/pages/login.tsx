import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/auth-context'

const ALLOWED_EMAILS = [
  'shawnjordanetal@gmail.com',
  'theodorelawson@gmail.com',
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signInWithMagicLink } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
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
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
