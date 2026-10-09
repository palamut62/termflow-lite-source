import { ipcMain } from 'electron'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()
let installed = false

/**
 * Record every `ipcMain.handle` registration so the remote hub can call the
 * exact same, already validated handlers for a phone. Must run before any
 * IPC is registered. Which channels a phone may reach is decided by the
 * allow-list in RemoteHub, not here.
 */
export function recordIpcHandlers(): void {
  if (installed) return
  installed = true
  const original = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Handler) => {
    handlers.set(channel, listener)
    return original(channel, listener as Parameters<typeof ipcMain.handle>[1])
  }) as typeof ipcMain.handle
}

/** Marker passed as the IpcMainInvokeEvent; no recorded handler reads it. */
const REMOTE_EVENT = Object.freeze({ remote: true })

export async function invokeRecorded(channel: string, args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for ${channel}`)
  return await handler(REMOTE_EVENT, ...args)
}
