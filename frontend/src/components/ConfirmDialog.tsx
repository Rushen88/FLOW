import {
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button,
} from '@mui/material'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  severity?: 'error' | 'warning' | 'info'
}

export default function ConfirmDialog({
  open, title, message, confirmText = 'Удалить', cancelText = 'Отмена',
  onConfirm, onCancel, severity = 'error',
}: ConfirmDialogProps) {
  const colorMap = { error: 'error', warning: 'warning', info: 'primary' } as const
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel}>{cancelText}</Button>
        <Button variant="contained" color={colorMap[severity]} onClick={onConfirm}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
