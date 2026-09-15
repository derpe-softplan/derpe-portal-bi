import type { ComponentType } from 'react'

export type PanelComponent = ComponentType<{ data: Record<string, unknown>[] }>
export type ThumbnailComponent = ComponentType

type PanelModule = { Panel: PanelComponent }
type ThumbnailModule = { Thumbnail: ThumbnailComponent }

const panelModules = import.meta.glob<PanelModule>('../reports/*/index.tsx', { eager: true })
const thumbnailModules = import.meta.glob<ThumbnailModule>('../reports/*/Thumbnail.tsx', { eager: true })

function slugFromPath(path: string): string {
  return path.replace(/^.*\/reports\//, '').replace(/\/.*$/, '')
}

export const PANELS: Record<string, PanelComponent> = Object.fromEntries(
  Object.entries(panelModules)
    .filter(([, m]) => m.Panel)
    .map(([path, m]) => [slugFromPath(path), m.Panel])
)

export const THUMBNAILS: Record<string, ThumbnailComponent> = Object.fromEntries(
  Object.entries(thumbnailModules)
    .filter(([, m]) => m.Thumbnail)
    .map(([path, m]) => [slugFromPath(path), m.Thumbnail])
)

export function resolvePanelBySlug(slug?: string) {
  if (!slug) return undefined
  return PANELS[slug]
}

export function resolveThumbnailBySlug(slug?: string) {
  if (!slug) return undefined
  return THUMBNAILS[slug]
}
