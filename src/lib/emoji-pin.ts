// Emoji PIN constants and utilities (client-side)

export const EMOJI_PALETTE = [
  '🦝', '🦊', '🐻', '🦉', '🐙',
  '🦎', '🐋', '🦩', '🦚', '🐝',
  '🌵', '🌻', '🍄', '🌊', '🔥',
  '⭐', '🌙', '🎸', '🎲', '🔮',
  '🏠', '🔑', '💎', '🚀', '🎯',
] as const

export const PIN_LENGTH = 4

export type EmojiChar = typeof EMOJI_PALETTE[number]

export function isValidPin(pin: string[]): boolean {
  return (
    pin.length === PIN_LENGTH &&
    pin.every((e) => (EMOJI_PALETTE as readonly string[]).includes(e))
  )
}

// SHA-256 hash of emoji sequence (browser-native crypto)
export async function hashPin(emojis: string[]): Promise<string> {
  const text = emojis.join('')
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
