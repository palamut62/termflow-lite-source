/**
 * Reads the pairing QR from a photo. A live camera view needs HTTPS, which the
 * Tailscale IP address does not have; a photo taken through a file input works
 * over plain HTTP, also in an iPhone home-screen app.
 */

/** The one-time code from a scanned pairing link, or from a bare code. */
export function extractPairCode(text: string): string | null {
  const fromLink = /[#&?]pair=([A-Za-z0-9_-]{6,100})/.exec(text)
  if (fromLink) return fromLink[1]
  const bare = text.trim().replace(/[\s-]/g, '')
  return /^[0-9A-Za-z]{10}$/.test(bare) ? bare : null
}

/** Longest side the photo is reduced to before decoding; tried large first, then smaller. */
const DECODE_SIZES = [1400, 900, 600]

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This photo cannot be read.')) }
    image.src = url
  })
}

/** Decoded QR text from a photo, or null when no code is found. */
export async function readQrFromPhoto(file: File): Promise<string | null> {
  const [{ default: jsQR }, image] = await Promise.all([import('jsqr'), loadImage(file)])
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  for (const max of DECODE_SIZES) {
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
    if (code?.data) return code.data
  }
  return null
}
