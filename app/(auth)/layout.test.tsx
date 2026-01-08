import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthLayout from './layout'

describe('AuthLayout', () => {
  it('renders children correctly', () => {
    render(
      <AuthLayout>
        <div data-testid="test-child">Test content</div>
      </AuthLayout>
    )
    expect(screen.getByTestId('test-child')).toBeInTheDocument()
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('renders gradient mesh background', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    )
    const mesh = screen.getByTestId('gradient-mesh')
    expect(mesh).toBeInTheDocument()
    expect(mesh).toHaveClass('fixed', 'inset-0', '-z-10')
  })

  it('uses medium intensity for gradient mesh', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    )
    const mesh = screen.getByTestId('gradient-mesh')
    expect(mesh).toHaveClass('opacity-60')
  })

  it('has proper layout structure for centering', () => {
    const { container } = render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('min-h-screen', 'items-center', 'justify-center')
  })

  it('constrains content width', () => {
    render(
      <AuthLayout>
        <div data-testid="child">Content</div>
      </AuthLayout>
    )
    const main = screen.getByRole('main')
    expect(main).toHaveClass('max-w-md')
  })
})
