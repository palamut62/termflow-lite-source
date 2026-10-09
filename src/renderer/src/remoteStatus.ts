import { useEffect, useState } from 'react'
import type { RemoteDeviceInfo } from '../../shared/remote'

/** Phones connected through Remote Access right now, kept live from status events. */
export function useConnectedPhones(): RemoteDeviceInfo[] {
  const [phones, setPhones] = useState<RemoteDeviceInfo[]>([])
  useEffect(() => {
    let current = true
    const refresh = (): void => {
      void window.termflow.remote.devices().then((devices) => {
        if (current) setPhones(devices.filter((d) => d.connected))
      })
    }
    refresh()
    const off = window.termflow.remote.onStatus(refresh)
    return () => {
      current = false
      off()
    }
  }, [])
  return phones
}

/** "Pixel 8 connected" / "2 phones connected: Pixel 8, iPhone". */
export function phonesLabel(phones: RemoteDeviceInfo[]): string {
  if (phones.length === 1) return `${phones[0].name} connected`
  return `${phones.length} phones connected: ${phones.map((p) => p.name).join(', ')}`
}
