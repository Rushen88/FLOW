import { useState } from 'react'
import {
  Card, CardContent, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, InputAdornment, Pagination,
  Box, Typography, Skeleton, Chip,
} from '@mui/material'
import { SxProps, Theme } from '@mui/material/styles'
import { Search } from '@mui/icons-material'
import { ReactNode } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  width?: number | string
  render?: (value: any, row: any) => ReactNode
}

interface DataTableProps {
  columns: Column[]
  rows: any[]
  loading?: boolean
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  page?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  emptyText?: string
  headerActions?: ReactNode
  onRowClick?: (row: any) => void
  getRowSx?: (row: any) => SxProps<Theme> | undefined
}

export default function DataTable({
  columns, rows, loading = false,
  search, onSearchChange, searchPlaceholder = 'Поиск...',
  page = 1, totalPages = 1, onPageChange,
  emptyText = 'Нет данных', headerActions, onRowClick, getRowSx,
}: DataTableProps) {
  return (
    <Card>
      <CardContent>
        {(onSearchChange || headerActions) && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            {onSearchChange && (
              <TextField
                size="small" placeholder={searchPlaceholder}
                value={search || ''} onChange={(e) => onSearchChange(e.target.value)}
                sx={{ minWidth: 300 }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            {headerActions}
          </Box>
        )}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell key={col.key} align={col.align || 'left'} sx={{ fontWeight: 600, width: col.width }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.key}><Skeleton animation="wave" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{emptyText}</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.map((row, idx) => (
                <TableRow
                  key={row.id || idx} hover
                  onClick={() => onRowClick?.(row)}
                  sx={{ ...(onRowClick ? { cursor: 'pointer' } : {}), ...(getRowSx?.(row) || {}) }}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} align={col.align || 'left'}>
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {totalPages > 1 && onPageChange && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={totalPages} page={page} onChange={(_, v) => onPageChange(v)} color="primary" />
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
