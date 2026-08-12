"use client"

// App-level UI preferences persisted in the browser, separate from connection
// state so the two can hydrate and version independently.
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

const STORE_NAME = "filesystem.preferences-store"
const STORE_VERSION = 1

export type TimeFormat = "12h" | "24h"

type PersistedPreferencesState = {
  showImagePreviews: boolean
  showFileExtensions: boolean
  timeFormat: TimeFormat
  /**
   * Run storage operations for UI-added (local) connections directly in the
   * browser via `files-sdk`, bypassing the server. Off by default.
   */
  directClientRequests: boolean
  /** Dot-prefixed (hidden) files and folders are shown in the browser. */
  showHiddenFiles: boolean
}

type PreferencesStore = PersistedPreferencesState & {
  setShowImagePreviews: (value: boolean) => void
  setShowFileExtensions: (value: boolean) => void
  setTimeFormat: (value: TimeFormat) => void
  setDirectClientRequests: (value: boolean) => void
  setShowHiddenFiles: (value: boolean) => void
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      showImagePreviews: true,
      showFileExtensions: true,
      timeFormat: "12h",
      directClientRequests: false,
      showHiddenFiles: false,
      setShowImagePreviews: (value) => set({ showImagePreviews: value }),
      setShowFileExtensions: (value) => set({ showFileExtensions: value }),
      setTimeFormat: (value) => set({ timeFormat: value }),
      setDirectClientRequests: (value) => set({ directClientRequests: value }),
      setShowHiddenFiles: (value) => set({ showHiddenFiles: value }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      partialize: (state): PersistedPreferencesState => ({
        showImagePreviews: state.showImagePreviews,
        showFileExtensions: state.showFileExtensions,
        timeFormat: state.timeFormat,
        directClientRequests: state.directClientRequests,
        showHiddenFiles: state.showHiddenFiles,
      }),
    }
  )
)
