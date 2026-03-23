import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAgent } from '@/hooks/use-agent'

interface Message {
  role: 'user' | 'advisor'
  content: string
}

export function AdvisorPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context?: { property_id?: string } }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const { invokeAgent, loading } = useAgent()

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])

    const result = await invokeAgent<{ response: string }>('advisor', {
      message: userMsg,
      context: context || {},
    })

    if (result?.response) {
      setMessages((prev) => [...prev, { role: 'advisor', content: result.response }])
    } else {
      setMessages((prev) => [...prev, { role: 'advisor', content: "I'm having trouble connecting — try again in a moment." }])
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
        <SheetHeader><SheetTitle>💬 Advisor</SheetTitle></SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">Ask me anything about your deals, markets, or portfolio.</p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="bg-muted rounded-lg px-3 py-2 text-sm animate-pulse">Thinking...</div></div>}
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Input
            placeholder="Ask the advisor..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()}>Send</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
