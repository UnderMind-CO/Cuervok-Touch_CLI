import { app } from 'electron'
import { join } from 'path'

export function getAppIconPath(): string {
  const resourceRoot = app.isPackaged
    ? process.resourcesPath
    : join(__dirname, '../../resources')

  return join(resourceRoot, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}