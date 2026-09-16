import { describe, it, expect } from 'vitest'
import { parseUTC, resolveImageUrl } from '../services/api'

describe('parseUTC', () => {
  it('retorna null para valor nulo', () => {
    expect(parseUTC(null)).toBeNull()
    expect(parseUTC(undefined)).toBeNull()
    expect(parseUTC('')).toBeNull()
  })

  it('adiciona Z em strings sem timezone', () => {
    const result = parseUTC('2024-06-15 10:30:00')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getUTCFullYear()).toBe(2024)
    expect(result!.getUTCMonth()).toBe(5) // junho = 5
    expect(result!.getUTCDate()).toBe(15)
  })

  it('não altera strings que já têm timezone', () => {
    const withZ = parseUTC('2024-06-15T10:30:00Z')
    const withOffset = parseUTC('2024-06-15T10:30:00-03:00')
    expect(withZ).toBeInstanceOf(Date)
    expect(withOffset).toBeInstanceOf(Date)
  })
})

describe('resolveImageUrl', () => {
  it('retorna undefined para url nula', () => {
    expect(resolveImageUrl(null)).toBeUndefined()
    expect(resolveImageUrl(undefined)).toBeUndefined()
    expect(resolveImageUrl('')).toBeUndefined()
  })

  it('passa URLs absolutas sem modificação', () => {
    expect(resolveImageUrl('https://example.com/img.png')).toBe('https://example.com/img.png')
    expect(resolveImageUrl('http://example.com/img.png')).toBe('http://example.com/img.png')
  })

  it('adiciona cache-bust a URLs absolutas quando solicitado', () => {
    const url = resolveImageUrl('https://example.com/img.png', true)
    expect(url).toMatch(/https:\/\/example\.com\/img\.png\?t=\d+/)
  })
})
