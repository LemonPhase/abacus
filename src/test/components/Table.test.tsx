import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@/components/ui/table'

describe('Table', () => {
  it('renders with custom className', () => {
    const { container } = render(
      <Table className="custom-class">
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const table = container.querySelector('table')
    expect(table).toHaveClass('custom-class')
  })

  it('renders with data-slot="table"', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const table = container.querySelector('table')
    expect(table).toHaveAttribute('data-slot', 'table')
  })

  it('renders container div with data-slot="table-container"', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const div = container.querySelector('div')
    expect(div).toHaveAttribute('data-slot', 'table-container')
  })
})

describe('TableHeader', () => {
  it('renders with data-slot="table-header"', () => {
    render(
      <table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </table>,
    )
    const header = document.querySelector('thead')
    expect(header).toHaveAttribute('data-slot', 'table-header')
  })
})

describe('TableBody', () => {
  it('renders with data-slot="table-body"', () => {
    render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    )
    const body = document.querySelector('tbody')
    expect(body).toHaveAttribute('data-slot', 'table-body')
  })
})

describe('TableFooter', () => {
  it('renders with data-slot="table-footer"', () => {
    render(
      <table>
        <TableFooter>
          <TableRow>
            <TableCell>footer</TableCell>
          </TableRow>
        </TableFooter>
      </table>,
    )
    const footer = document.querySelector('tfoot')
    expect(footer).toHaveAttribute('data-slot', 'table-footer')
  })
})

describe('TableRow', () => {
  it('renders with data-slot="table-row"', () => {
    render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    )
    const row = document.querySelector('tr')
    expect(row).toHaveAttribute('data-slot', 'table-row')
  })
})

describe('TableHead', () => {
  it('renders with data-slot="table-head"', () => {
    render(
      <table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
      </table>,
    )
    const head = document.querySelector('th')
    expect(head).toHaveAttribute('data-slot', 'table-head')
  })
})

describe('TableCell', () => {
  it('renders with data-slot="table-cell"', () => {
    render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell>value</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    )
    const cell = document.querySelector('td')
    expect(cell).toHaveAttribute('data-slot', 'table-cell')
  })
})

describe('TableCaption', () => {
  it('renders with data-slot="table-caption"', () => {
    render(
      <table>
        <TableCaption>List of items</TableCaption>
      </table>,
    )
    const caption = document.querySelector('caption')
    expect(caption).toHaveAttribute('data-slot', 'table-caption')
  })
})

describe('Full table integration', () => {
  it('renders all parts together correctly', () => {
    const { container } = render(
      <Table>
        <TableCaption>A list of items</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alpha</TableCell>
            <TableCell>100</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Beta</TableCell>
            <TableCell>200</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell>300</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    )

    expect(container.querySelector('table')).toHaveAttribute('data-slot', 'table')
    expect(container.querySelector('thead')).toHaveAttribute('data-slot', 'table-header')
    expect(container.querySelector('tbody')).toHaveAttribute('data-slot', 'table-body')
    expect(container.querySelector('tfoot')).toHaveAttribute('data-slot', 'table-footer')
    expect(container.querySelector('tr')).toHaveAttribute('data-slot', 'table-row')
    expect(container.querySelector('th')).toHaveAttribute('data-slot', 'table-head')
    expect(container.querySelector('td')).toHaveAttribute('data-slot', 'table-cell')
    expect(container.querySelector('caption')).toHaveAttribute('data-slot', 'table-caption')

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })
})

describe('Table components pass through additional props', () => {
  it('Table accepts id and aria-label', () => {
    const { container } = render(
      <Table id="data-table" aria-label="My Table">
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const table = container.querySelector('table')
    expect(table).toHaveAttribute('id', 'data-table')
    expect(table).toHaveAttribute('aria-label', 'My Table')
  })

  it('TableRow accepts id', () => {
    const { container } = render(
      <table>
        <TableBody>
          <TableRow id="row-1">
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    )
    const row = container.querySelector('tr')
    expect(row).toHaveAttribute('id', 'row-1')
  })

  it('TableCell accepts colSpan and id', () => {
    const { container } = render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell id="c1" colSpan={2}>
              merged
            </TableCell>
          </TableRow>
        </TableBody>
      </table>,
    )
    const cell = container.querySelector('td')
    expect(cell).toHaveAttribute('id', 'c1')
    expect(cell).toHaveAttribute('colspan', '2')
  })

  it('TableHead accepts id', () => {
    const { container } = render(
      <table>
        <TableHeader>
          <TableRow>
            <TableHead id="name-col">Name</TableHead>
          </TableRow>
        </TableHeader>
      </table>,
    )
    const head = container.querySelector('th')
    expect(head).toHaveAttribute('id', 'name-col')
  })
})
