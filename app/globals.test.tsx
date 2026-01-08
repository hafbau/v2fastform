import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Test component that uses glassmorphism classes
function GlassTestComponent() {
  return (
    <div>
      <div data-testid="glass" className="glass">
        Glass base
      </div>
      <div data-testid="glass-card" className="glass-card">
        Glass card
      </div>
      <div data-testid="glass-navbar" className="glass-navbar">
        Glass navbar
      </div>
    </div>
  )
}

describe('Glassmorphism CSS Classes', () => {
  it('glass class can be applied to elements', () => {
    render(<GlassTestComponent />)
    const element = screen.getByTestId('glass')
    expect(element).toHaveClass('glass')
    expect(element).toBeInTheDocument()
  })

  it('glass-card class can be applied to elements', () => {
    render(<GlassTestComponent />)
    const element = screen.getByTestId('glass-card')
    expect(element).toHaveClass('glass-card')
    expect(element).toBeInTheDocument()
  })

  it('glass-navbar class can be applied to elements', () => {
    render(<GlassTestComponent />)
    const element = screen.getByTestId('glass-navbar')
    expect(element).toHaveClass('glass-navbar')
    expect(element).toBeInTheDocument()
  })

  it('glassmorphism elements render content correctly', () => {
    render(<GlassTestComponent />)
    expect(screen.getByText('Glass base')).toBeInTheDocument()
    expect(screen.getByText('Glass card')).toBeInTheDocument()
    expect(screen.getByText('Glass navbar')).toBeInTheDocument()
  })
})
