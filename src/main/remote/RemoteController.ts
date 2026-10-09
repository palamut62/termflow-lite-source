import { randomBytes } from 'crypto'
import { homedir } from 'os'
import QRCode from 'qrcode'
import type { AppSettings, ShellInfo } from '../../shared/types'
import type { RemoteCommandReply, RemoteDeviceInfo, RemotePairing, RemoteStatus, RemoteTabCommand, RemoteTabsState } from '../../shared/remote'
import { DeviceStore, formatPairingCode } from './devices'
import { RemoteHub, type RemoteTerminals } from './RemoteHub'
import { RemoteServer } from './RemoteServer'
import { findTailscaleAddress } from './tailscale'

const COMMAND_TIMEOUT_MS = 15_000
/** How often the Tailscale address is re-checked while Remote Access is on. */
const ADDRESS_POLL_MS = 15_000

export interface RemoteControllerDeps {
  devicesFile: string
  staticDir: string
  terminals: RemoteTerminals
  invokeIpc(channel: string, args: unknown[]): Promise<unknown>
  getSettings(): AppSettings
  getShells(): Promise<ShellInfo[]>
  /** Deliver a tab command to the desktop renderer; false when no window is there. */
  sendToRenderer(request: { requestId: string; command: RemoteTabCommand }): boolean
  /** Push settings changed by a phone into the desktop renderer. */
  pushSettings(settings: AppSettings): void
  pushStatus(status: RemoteStatus): void
  platform: string
  version: string
  findAddress?: () => string | null
}

/**
 * Owns Remote Access for the app: starts/stops the server with the setting,
 * follows the Tailscale address, shows pairing QR codes, manages devices and
 * relays phone tab commands to the desktop renderer.
 */
export class RemoteController {
  readonly devices: DeviceStore
  readonly hub: RemoteHub
  private server: RemoteServer
  private state: RemoteStatus = { state: 'off', url: null, error: null, connectedDevices: 0 }
  private address: string | null = null
  private port = 0
  private poll: NodeJS.Timeout | null = null
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>()
  private applying: Promise<void> = Promise.resolve()

  constructor(private readonly deps: RemoteControllerDeps) {
    this.devices = new DeviceStore(deps.devicesFile)
    this.hub = new RemoteHub({
      terminals: deps.terminals,
      devices: this.devices,
      invokeIpc: deps.invokeIpc,
      getSettings: deps.getSettings,
      getShells: deps.getShells,
      runTabCommand: (command) => this.runTabCommand(command),
      onRemoteSettings: deps.pushSettings,
      onClientsChanged: () => this.publish(),
      platform: deps.platform,
      version: deps.version,
      home: homedir()
    })
    this.server = new RemoteServer({
      staticDir: deps.staticDir,
      hub: this.hub,
      devices: this.devices,
      onPaired: () => this.publish()
    })
  }

  status(): RemoteStatus {
    return { ...this.state, connectedDevices: this.hub.connectedDeviceIds().size }
  }

  /** Apply the current settings; serialized so quick toggles cannot race. */
  apply(settings: AppSettings): Promise<void> {
    this.applying = this.applying.then(() => this.applyNow(settings)).catch(() => undefined)
    return this.applying
  }

  private async applyNow(settings: AppSettings): Promise<void> {
    const { enabled, port } = settings.remote
    if (!enabled) {
      this.stopPolling()
      await this.stopServer()
      this.setState({ state: 'off', url: null, error: null })
      return
    }
    this.startPolling()
    const address = (this.deps.findAddress ?? findTailscaleAddress)()
    if (!address) {
      await this.stopServer()
      this.setState({ state: 'no-tailscale', url: null, error: 'Tailscale is not connected on this computer.' })
      return
    }
    if (this.server.listening && address === this.address && port === this.port) return
    this.setState({ state: 'starting', url: null, error: null })
    try {
      await this.server.start(address, port)
      this.address = address
      this.port = port
      this.setState({ state: 'running', url: `http://${address}:${port}`, error: null })
    } catch (error) {
      this.address = null
      const code = (error as NodeJS.ErrnoException).code
      this.setState({
        state: 'error',
        url: null,
        error: code === 'EADDRINUSE' ? `Port ${port} is already in use. Pick another port.` : 'The remote server could not start.'
      })
    }
  }

  private startPolling(): void {
    if (this.poll) return
    this.poll = setInterval(() => void this.apply(this.deps.getSettings()), ADDRESS_POLL_MS)
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }

  private async stopServer(): Promise<void> {
    this.devices.cancelPairing()
    if (!this.server.listening) return
    // Sockets just close; paired phones keep their token and reconnect later.
    await this.server.stop()
    this.address = null
  }

  async shutdown(): Promise<void> {
    this.stopPolling()
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error('Shutting down'))
    }
    this.pending.clear()
    this.hub.dispose()
    await this.server.stop()
  }

  async startPairing(): Promise<RemotePairing> {
    if (this.state.state !== 'running' || !this.state.url) throw new Error('Turn on Remote Access first.')
    const { code, expiresAt } = this.devices.startPairing()
    const url = `${this.state.url}/#pair=${code}`
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
    return { url, svg, expiresAt, code: formatPairingCode(code) }
  }

  cancelPairing(): void {
    this.devices.cancelPairing()
  }

  listDevices(): RemoteDeviceInfo[] {
    const connected = this.hub.connectedDeviceIds()
    return this.devices.list().map((d) => ({ ...d, connected: connected.has(d.id) }))
  }

  /** null revokes every device. */
  revoke(deviceId: string | null): void {
    if (deviceId === null) this.devices.revokeAll()
    else this.devices.revoke(deviceId)
    this.hub.revokeDevice(deviceId)
    this.publish()
  }

  setTabs(state: RemoteTabsState): void {
    this.hub.setTabs(state)
  }

  settingsChanged(settings: AppSettings): void {
    this.hub.settingsChanged(settings)
    void this.apply(settings)
  }

  commandReply(reply: RemoteCommandReply): void {
    const entry = this.pending.get(reply.requestId)
    if (!entry) return
    this.pending.delete(reply.requestId)
    clearTimeout(entry.timer)
    if (reply.ok) entry.resolve(reply.value)
    else entry.reject(new Error(reply.error || 'The desktop could not do that.'))
  }

  private runTabCommand(command: RemoteTabCommand): Promise<unknown> {
    const requestId = randomBytes(8).toString('hex')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('The desktop did not answer.'))
      }, COMMAND_TIMEOUT_MS)
      this.pending.set(requestId, { resolve, reject, timer })
      if (!this.deps.sendToRenderer({ requestId, command })) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(new Error('The desktop window is not available.'))
      }
    })
  }

  private setState(next: Omit<RemoteStatus, 'connectedDevices'>): void {
    this.state = { ...next, connectedDevices: 0 }
    this.publish()
  }

  private publish(): void {
    this.deps.pushStatus(this.status())
  }
}
