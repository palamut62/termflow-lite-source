import { ipcMain } from 'electron'
import { IPC, type DirListing, type FileSearchQuery, type FileSearchResult } from '../../shared/ipc'
import { listDirectory } from '../files'
import { searchFiles } from '../fileSearch'

/** Read-only folder listing for the file panel. */
export function registerFilesIpc(): void {
  ipcMain.handle(IPC.FILES_LIST, async (_event, dir: unknown, showHidden: unknown): Promise<DirListing | null> =>
    typeof dir === 'string' ? listDirectory(dir, showHidden === true) : null)
  ipcMain.handle(IPC.FILES_SEARCH, async (_event, dir: unknown, query: FileSearchQuery): Promise<FileSearchResult> => searchFiles(dir, query))
}
