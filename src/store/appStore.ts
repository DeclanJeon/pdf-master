import { create } from 'zustand'
import type { ToolInfo, ToolStatus } from '@/types'

interface AppState {
  currentTool: ToolInfo | null
  toolStatus: ToolStatus
  progress: number
  resultUrl: string | null
  error: string | null
  premiumUnlocked: boolean
  dailyFreeUsed: number
  dailyFreeLimit: number

  setCurrentTool: (tool: ToolInfo | null) => void
  setToolStatus: (status: ToolStatus) => void
  setProgress: (progress: number) => void
  setResultUrl: (url: string | null) => void
  setError: (error: string | null) => void
  useFreeAttempt: () => boolean
  setPremiumUnlocked: (unlocked: boolean) => void
  reset: () => void
}

const DAILY_FREE_LIMIT = 3

export const useAppStore = create<AppState>((set, get) => ({
  currentTool: null,
  toolStatus: 'idle',
  progress: 0,
  resultUrl: null,
  error: null,
  premiumUnlocked: false,
  dailyFreeUsed: 0,
  dailyFreeLimit: DAILY_FREE_LIMIT,

  setCurrentTool: (tool) => set({ currentTool: tool, toolStatus: 'idle', progress: 0, resultUrl: null, error: null }),
  setToolStatus: (status) => set({ toolStatus: status }),
  setProgress: (progress) => set({ progress }),
  setResultUrl: (url) => set({ resultUrl: url, toolStatus: url ? 'done' : 'idle' }),
  setError: (error) => set({ error, toolStatus: error ? 'error' : 'idle' }),
  useFreeAttempt: () => {
    const { dailyFreeUsed, dailyFreeLimit, premiumUnlocked } = get()
    if (premiumUnlocked) return true
    if (dailyFreeUsed >= dailyFreeLimit) return false
    set({ dailyFreeUsed: dailyFreeUsed + 1 })
    return true
  },
  setPremiumUnlocked: (unlocked) => set({ premiumUnlocked: unlocked }),
  reset: () => set({ currentTool: null, toolStatus: 'idle', progress: 0, resultUrl: null, error: null }),
}))
