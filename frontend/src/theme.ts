import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: {
      main: '#E91E63',
      light: '#F48FB1',
      dark: '#C2185B',
    },
    secondary: {
      main: '#7C4DFF',
      light: '#B388FF',
      dark: '#651FFF',
    },
    background: {
      default: '#F5F5F7',
      paper: '#FFFFFF',
    },
    success: { main: '#4CAF50' },
    warning: { main: '#FF9800' },
    error: { main: '#F44336' },
    info: { main: '#2196F3' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
  },
})
