import { app } from 'electron'
import path from 'path'

export const APP_PATH = app.getAppPath()

let _gamePath: string | null = null
export function getGamePath(): string {
  if (!_gamePath) _gamePath = path.join(app.getPath('userData'), 'game') + '/'
  return _gamePath
}

let _charImagesPath: string | null = null
export function getCharacterImagesPath(): string {
  if (!_charImagesPath) _charImagesPath = path.join(app.getPath('userData'), 'character-images') + '/'
  return _charImagesPath
}

// Non-game data served by the emulator should be treated as server-owned.
// If a bundled news.json exists in the client package, do not let it override
// what the emulator returns via HAAPI.
export const DTO_NEWS_PATH = path.join(APP_PATH, 'data', 'news.json')

// The emulator is the single source of truth for news/changelogs. Once this
// desktop client is packaged for players, server-owned endpoints
// (Cms/Items/Get, getForumPostsList, getForumTopicsList) should never be
// replaced by any local data/news.json copy.
//
// This flag is a client hint used by the HAAPI proxy and by any renderer or
// game-bridge code that may still read data/news.json directly. When it is
// enabled, client-side news reads must prefer / refresh from the emulator and
// must not cache or shadow the emulator's response with a local file.
export const EMULATOR_CAPITALIZE_NEWS = true

export const get = {
  GAME_PATH: () => getGamePath(),
  CHARACTER_IMAGES_PATH: () => getCharacterImagesPath(),
  LOCAL_ASSET_MAP_PATH: () => getGamePath() + 'assetMap.json',
  LOCAL_DOFUS_MANIFEST_PATH: () => getGamePath() + 'manifest.json',
  LOCAL_CUSTOM_MANIFEST_PATH: () => getGamePath() + 'customManifest.json',
  LOCAL_REGEX_PATH: () => getGamePath() + 'regex.json',
  LOCAL_VERSIONS_PATH: () => getGamePath() + 'versions.json',
  FROZEN_MARKER_PATH: () => getGamePath() + '.frozen',
}

export const FROZEN_VERSION = '1.73.5'
