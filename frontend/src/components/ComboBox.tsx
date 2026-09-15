import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, Check } from 'lucide-react'

interface ComboBoxBase {
  label: string
  options: string[]
  allLabel?: string
}

interface ComboBoxSingle extends ComboBoxBase {
  multiple?: false
  value: string | null
  onChange: (v: string | null) => void
}

interface ComboBoxMulti extends ComboBoxBase {
  multiple: true
  value: string[]
  onChange: (v: string[]) => void
}

export type ComboBoxProps = ComboBoxSingle | ComboBoxMulti

export function ComboBox(props: ComboBoxProps) {
  const { label, options, allLabel = 'Todos' } = props
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const isMulti = props.multiple === true
  const selected: string[] = isMulti
    ? (props.value as string[])
    : ((props.value as string | null) ? [(props.value as string)] : [])
  const isActive = selected.length > 0

  function getLabel() {
    if (!isActive) return allLabel
    if (selected.length === 1) return selected[0]
    return `${selected.length} selecionados`
  }

  function handleSelect(v: string) {
    if (props.multiple) {
      const next = props.value.includes(v) ? props.value.filter(x => x !== v) : [...props.value, v]
      props.onChange(next)
    } else {
      props.onChange(v)
      setOpen(false)
    }
  }

  function handleClear() {
    if (props.multiple) props.onChange([])
    else props.onChange(null)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
        {label}
        {isActive && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" />}
      </label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={isActive ? selected.join(', ') : undefined}
        className={`w-full flex items-center justify-between text-sm border rounded-lg px-3 py-2 bg-white cursor-pointer transition-colors ${
          isActive
            ? 'border-blue-400 text-blue-700 bg-blue-50'
            : 'border-gray-200 text-gray-700 hover:border-gray-300'
        } focus:outline-none focus:ring-2 focus:ring-blue-200`}
      >
        <span className="truncate">{getLabel()}</span>
        <ChevronDown size={14} className={`ml-2 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden min-w-[160px]">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 rounded-md">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Pesquisar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>
          <ul className="max-h-48 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={handleClear}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${!isActive ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-500 italic'}`}
              >
                {allLabel}
              </button>
            </li>
            {filtered.map(o => (
              <li key={o}>
                <button
                  type="button"
                  onClick={() => handleSelect(o)}
                  title={o}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2.5 ${selected.includes(o) ? 'text-blue-700 bg-blue-50' : 'text-gray-700'}`}
                >
                  {isMulti && (
                    <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      selected.includes(o) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                    }`}>
                      {selected.includes(o) && <Check size={10} className="text-white" strokeWidth={3} />}
                    </span>
                  )}
                  <span className={`truncate ${selected.includes(o) ? 'font-semibold' : ''}`}>{o}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-gray-400 text-center">Nenhum resultado</li>
            )}
          </ul>
          {isMulti && (
            <div className="p-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full text-xs font-semibold text-blue-600 hover:text-blue-800 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                {isActive ? `Confirmar (${selected.length})` : 'Fechar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
