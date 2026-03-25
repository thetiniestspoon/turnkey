import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { EMOJI_PALETTE, PIN_LENGTH } from '@/lib/emoji-pin'

interface EmojiPinPadProps {
  onSubmit: (pin: string[]) => void
  loading?: boolean
  error?: string | null
  submitLabel?: string
}

export function EmojiPinPad({ onSubmit, loading, error, submitLabel = 'Enter 🦝' }: EmojiPinPadProps) {
  const [pin, setPin] = useState<string[]>([])

  const handleEmojiTap = useCallback((emoji: string) => {
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev
      return [...prev, emoji]
    })
  }, [])

  const handleDotTap = useCallback((index: number) => {
    setPin((prev) => prev.slice(0, index))
  }, [])

  const handleClear = useCallback(() => {
    setPin([])
  }, [])

  const handleSubmit = useCallback(() => {
    if (pin.length === PIN_LENGTH) {
      onSubmit(pin)
      setPin([])
    }
  }, [pin, onSubmit])

  return (
    <div className="space-y-4">
      {/* PIN display dots */}
      <div className="flex items-center justify-center gap-3">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleDotTap(i)}
            className="w-12 h-12 rounded-xl border-2 flex items-center justify-center text-2xl transition-all duration-150 select-none"
            style={{
              borderColor: pin[i] ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              backgroundColor: pin[i] ? 'hsl(var(--primary) / 0.05)' : 'transparent',
            }}
            disabled={loading}
            aria-label={pin[i] ? `Remove emoji at position ${i + 1}` : `Position ${i + 1} empty`}
          >
            {pin[i] || (
              <span className="w-3 h-3 rounded-full bg-muted-foreground/20" />
            )}
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && <p className="text-destructive text-sm text-center">{error}</p>}

      {/* 5x5 Emoji grid */}
      <div className="grid grid-cols-5 gap-2">
        {EMOJI_PALETTE.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleEmojiTap(emoji)}
            disabled={pin.length >= PIN_LENGTH || loading}
            className="h-12 rounded-lg text-2xl flex items-center justify-center transition-all duration-100 hover:bg-muted active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed select-none border border-transparent hover:border-border"
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={handleClear}
          disabled={pin.length === 0 || loading}
        >
          Clear
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={handleSubmit}
          disabled={pin.length !== PIN_LENGTH || loading}
        >
          {loading ? '🦝 Checking...' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
