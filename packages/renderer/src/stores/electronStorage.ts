import type { StateStorage } from 'zustand/middleware'

export const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return window.cuervok.storeGet(name)
  },
  setItem: (name: string, value: string): void => {
    window.cuervok.storeSet(name, value)
  },
  removeItem: (name: string): void => {
    window.cuervok.storeDelete(name)
  },
}
