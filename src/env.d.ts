import type { Settings } from './model'
export {}
declare global {
 interface Window {
  bistro?: {
   onWindowModeChanged: (callback:(mode:Settings['windowMode'])=>void) => () => void
   settings: () => Promise<Settings>
   saveSettings: (settings: Settings, token?: string) => Promise<Settings>
   fetchBugs: () => Promise<unknown>
   loadMock: () => Promise<unknown>
   saveMock: (items: unknown) => Promise<void>
   windowAction: (action: 'minimize'|'maximize'|'close'|'restore'|'desktop') => Promise<{mode:string;message?:string}>
   platform: string
  }
 }
}
