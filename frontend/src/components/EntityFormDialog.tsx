import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  CircularProgress, IconButton, Box,
} from '@mui/material'
import { Close } from '@mui/icons-material'
import { ReactNode } from 'react'

interface EntityFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: () => void
  title: string
  loading?: boolean
  submitText?: string
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg'
  children: ReactNode
  disabled?: boolean
}

export default function EntityFormDialog({
  open, onClose, onSubmit, title,
  loading = false, submitText = 'Сохранить',
  maxWidth = 'sm', children, disabled = false,
}: EntityFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ pt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {children}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>Отмена</Button>
        <Button
          variant="contained" onClick={onSubmit}
          disabled={loading || disabled}
          startIcon={loading ? <CircularProgress size={18} /> : undefined}
        >
          {submitText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
