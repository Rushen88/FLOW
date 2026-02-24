import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Snackbar, Alert, AlertColor } from '@mui/material'

interface Notification {
  message: string
  severity: AlertColor
}

interface NotificationContextType {
  notify: (message: string, severity?: AlertColor) => void
}

const NotificationContext = createContext<NotificationContextType>({ notify: () => {} })

export const useNotification = () => useContext(NotificationContext)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [notification, setNotification] = useState<Notification>({ message: '', severity: 'success' })

  const notify = useCallback((message: string, severity: AlertColor = 'success') => {
    setNotification({ message, severity })
    setOpen(true)
  }, [])

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={6000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={notification.severity}
          variant="filled"
          sx={{ width: '100%', maxWidth: 500, whiteSpace: 'pre-line' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  )
}
