import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrendingUp } from 'lucide-react'
import { KpiCard } from '../components/KpiCard'

describe('KpiCard', () => {
  it('renderiza título e valor', () => {
    render(<KpiCard title="Contratos" value={42} icon={<TrendingUp />} />)
    expect(screen.getByText('Contratos')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renderiza subtitle quando fornecido', () => {
    render(<KpiCard title="KPI" value="100" subtitle="mês atual" icon={<TrendingUp />} />)
    expect(screen.getByText('mês atual')).toBeInTheDocument()
  })

  it('mostra estado de loading (skeleton)', () => {
    const { container } = render(<KpiCard title="KPI" value="0" icon={<TrendingUp />} loading />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('chama onClick ao clicar', async () => {
    const user = userEvent.setup()
    let clicked = false
    render(
      <KpiCard title="KPI" value="0" icon={<TrendingUp />} onClick={() => { clicked = true }} />
    )
    await user.click(screen.getByText('KPI'))
    expect(clicked).toBe(true)
  })

  it('renderiza texto do tooltip quando fornecido', () => {
    render(<KpiCard title="KPI" value="0" icon={<TrendingUp />} tooltip="Explicação aqui" />)
    expect(screen.getByText('Explicação aqui')).toBeInTheDocument()
  })
})
