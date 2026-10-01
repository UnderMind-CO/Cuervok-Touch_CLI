declare module 'discord-rpc' {
  interface ClientOptions {
    transport?: string
  }

  interface Presence {
    details?: string
    state?: string
    startTimestamp?: number | Date
    endTimestamp?: number | Date
    largeImageKey?: string
    largeImageText?: string
    smallImageKey?: string
    smallImageText?: string
    instance?: boolean
    buttons?: Array<{ label: string; url: string }>
  }

  class Client {
    constructor(options: ClientOptions)
    login(options: { clientId: string }): Promise<void>
    destroy(): Promise<void>
    setActivity(presence: Presence): Promise<void>
    clearActivity(): Promise<void>
    on(event: string, listener: (...args: any[]) => void): this
    once(event: string, listener: (...args: any[]) => void): this
    removeAllListeners(event?: string): this
  }

  export { Client, Presence, ClientOptions }
}
