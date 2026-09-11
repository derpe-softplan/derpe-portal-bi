import type { ComponentType } from 'react'
import { FluxoMedicoes } from './FluxoMedicoes'
import { FluxoMedicoesThumbnail } from './FluxoMedicoes/Thumbnail'

export type PanelComponent = ComponentType<{ data: Record<string, unknown>[] }>
export type ThumbnailComponent = ComponentType

const DEFAULT_PANEL_SLUG = 'fluxo-medicoes-completa'

export const PANELS: Record<string, PanelComponent> = {
  'fluxo-medicoes-completa': FluxoMedicoes,
  'fluxo-medicoes': FluxoMedicoes,
  'fluxo-medicoes-completo': FluxoMedicoes,
}

export const THUMBNAILS: Record<string, ThumbnailComponent> = {
  'fluxo-medicoes-completa': FluxoMedicoesThumbnail,
  'fluxo-medicoes': FluxoMedicoesThumbnail,
  'fluxo-medicoes-completo': FluxoMedicoesThumbnail,
}

export function resolvePanelBySlug(slug?: string) {
  if (!slug) return undefined
  return PANELS[slug] ?? PANELS[DEFAULT_PANEL_SLUG]
}

export function resolveThumbnailBySlug(slug?: string) {
  if (!slug) return undefined
  return THUMBNAILS[slug] ?? THUMBNAILS[DEFAULT_PANEL_SLUG]
}
