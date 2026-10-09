import { useCallback, useEffect, useState } from 'react'
import { Smartphone, Trash2 } from 'lucide-react'
import type { RemoteDeviceInfo, RemotePairing, RemoteStatus } from '../../../shared/remote'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { Field, NumberInput, Toggle } from './Settings'

function statusText(status: RemoteStatus | null): string {
  if (!status) return 'Loading...'
  switch (status.state) {
    case 'off': return 'Off'
    case 'starting': return 'Starting...'
    case 'running': return `Listening on ${status.url} (Tailscale only)`
    case 'no-tailscale': return 'Waiting for Tailscale. Connect this computer to your tailnet.'
    case 'error': return status.error ?? 'The remote server could not start.'
  }
}

const date = (time: number): string => new Date(time).toLocaleString()

export function RemoteSettings(): React.JSX.Element {
  const remote = useSettingsStore((s) => s.settings.remote)
  const update = useSettingsStore((s) => s.update)
  const toast = useToastStore((s) => s.show)
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [devices, setDevices] = useState<RemoteDeviceInfo[]>([])
  const [pairing, setPairing] = useState<RemotePairing | null>(null)
  const [port, setPort] = useState(remote.port)
  const [confirmAll, setConfirmAll] = useState(false)
  const [now, setNow] = useState(Date.now())

  const refreshDevices = useCallback(async (): Promise<void> => {
    setDevices(await window.termflow.remote.devices())
  }, [])

  useEffect(() => {
    void window.termflow.remote.status().then(setStatus)
    void refreshDevices()
    return window.termflow.remote.onStatus((next) => {
      setStatus(next)
      void refreshDevices()
    })
  }, [refreshDevices])

  useEffect(() => setPort(remote.port), [remote.port])

  // A paired device consumes the code: close the QR once the device list grows.
  const deviceCount = devices.length
  useEffect(() => {
    setPairing(null)
  }, [deviceCount])

  useEffect(() => {
    if (!pairing) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pairing])

  useEffect(() => () => { void window.termflow.remote.cancelPair() }, [])

  const setEnabled = async (enabled: boolean): Promise<void> => {
    if (!enabled) setPairing(null)
    await update({ remote: { ...remote, enabled } })
  }

  const savePort = async (): Promise<void> => {
    if (port === remote.port) return
    await update({ remote: { ...remote, port } })
    toast(`Remote Access now uses port ${port}. Pair phones again if they cannot connect.`)
  }

  const showQr = async (): Promise<void> => {
    try {
      setPairing(await window.termflow.remote.pair())
      setNow(Date.now())
    } catch (error) {
      toast(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not create a pairing code.')
    }
  }

  const hideQr = (): void => {
    setPairing(null)
    void window.termflow.remote.cancelPair()
  }

  const revoke = async (deviceId: string | null): Promise<void> => {
    await window.termflow.remote.revoke(deviceId)
    setConfirmAll(false)
    await refreshDevices()
    toast(deviceId ? 'Device disconnected.' : 'All devices disconnected.')
  }

  const secondsLeft = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0
  const running = status?.state === 'running'

  return (
    <div className="settings-section">
      <div className="settings-section-title"><Smartphone size={14} /> Remote Access</div>
      <p className="settings-note">
        Control this TermFlow Lite from your phone over Tailscale: watch and type in every tab, open and close tabs,
        manage profiles, providers and settings. The server listens only on this computer's Tailscale address,
        never on your local network or the internet. A phone stays connected until you disconnect it here.
        If the phone cannot reach the address, allow TermFlow Lite when Windows Firewall asks.
      </p>
      <Field label="Enable Remote Access" hint={statusText(status)}>
        <Toggle checked={remote.enabled} label="Enable Remote Access" onChange={(on) => void setEnabled(on)} />
      </Field>
      <Field label="Port" hint="TCP port on the Tailscale address">
        <span className="memory-inline">
          <NumberInput value={port} min={1024} max={65535} onChange={setPort} />
          <button className="settings-btn settings-btn-small" disabled={port === remote.port} onClick={() => void savePort()}>Apply</button>
        </span>
      </Field>

      {remote.enabled && (
        <Field label="Pair a phone" hint="Scan the code with the phone's camera. Both devices must be signed in to the same tailnet.">
          {pairing
            ? <button className="settings-btn settings-btn-small" onClick={hideQr}>Hide code</button>
            : <button className="settings-btn settings-btn-small settings-btn-primary" disabled={!running} onClick={() => void showQr()}>Show QR code</button>}
        </Field>
      )}
      {pairing && (
        <div className="remote-pairing">
          {secondsLeft > 0
            ? <img className="remote-qr" alt="Pairing QR code" src={`data:image/svg+xml;utf8,${encodeURIComponent(pairing.svg)}`} />
            : <div className="remote-qr remote-qr-expired">Expired</div>}
          <div className="remote-pairing-info">
            <span>{secondsLeft > 0 ? `One-time code, valid for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : 'This code expired.'}</span>
            {secondsLeft > 0 && <span className="remote-code" aria-label="Pairing code">{pairing.code}</span>}
            <span>No camera, or using the app from the home screen? Open {status?.url} on the phone and type this code.</span>
            {secondsLeft === 0 && <button className="settings-btn settings-btn-small" onClick={() => void showQr()}>New code</button>}
          </div>
        </div>
      )}

      <div className="settings-section-title">Paired devices</div>
      {devices.length === 0 && <p className="settings-note">No phone is paired yet.</p>}
      {devices.map((device) => (
        <Field key={device.id} label={device.name} hint={`${device.connected ? 'Connected now' : `Last seen ${date(device.lastSeenAt)}`} · paired ${date(device.createdAt)}`}>
          <button className="settings-btn settings-btn-small settings-btn-danger" onClick={() => void revoke(device.id)} aria-label={`Disconnect ${device.name}`}>
            <Trash2 size={12} /> Disconnect
          </button>
        </Field>
      ))}
      {devices.length > 1 && (confirmAll
        ? (
          <div className="profile-form-actions">
            <button className="settings-btn settings-btn-danger" onClick={() => void revoke(null)}>Disconnect all devices</button>
            <button className="settings-btn" onClick={() => setConfirmAll(false)}>Cancel</button>
          </div>
        )
        : <button className="settings-btn" onClick={() => setConfirmAll(true)}>Disconnect all...</button>)}
    </div>
  )
}
