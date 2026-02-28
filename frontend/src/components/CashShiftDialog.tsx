import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, Box, CircularProgress, Alert } from '@mui/material';
import api from '../api';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { CashShift, Wallet } from '../shared/types';

interface CashShiftDialogProps {
  open: boolean;
  onClose: () => void;
  activeShift: CashShift | null;
  onShiftChanged: () => void;
}

export default function CashShiftDialog({ open, onClose, activeShift, onShiftChanged }: CashShiftDialogProps) {
  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  
  // Close shift state
  const [actualBalance, setActualBalance] = useState('');
  const [notes, setNotes] = useState('');
  const { notify } = useNotification();
  const { user } = useAuth();

  useEffect(() => {
    if (open && !activeShift) {
      loadWallets();
    }
    if (open) {
      setActualBalance('');
      setNotes('');
    }
  }, [open, activeShift]);

  const loadWallets = async () => {
    try {
      const res = await api.get('/finance/wallets/');
      const cashWallets = res.data.results.filter((w: any) => w.wallet_type === 'cash' || w.wallet_type === 'card');
      setWallets(cashWallets);
      if (cashWallets.length > 0) setSelectedWalletId(cashWallets[0].id);
    } catch (err) {
      notify('Ошибка загрузки кошельков', 'error');
    }
  };

  const handleOpenShift = async () => {
    if (!selectedWalletId || !user?.active_trading_point) {
      notify('Выберите кассу и убедитесь, что вы находитесь на торговой точке', 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = {
         trading_point: user.active_trading_point,
         wallet: selectedWalletId
      };
      await api.post('/finance/cash-shifts/', payload);
      notify('Смена успешно открыта!', 'success');
      onShiftChanged();
      onClose();
    } catch (err: any) {
      notify('Ошибка открытия смены', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    if (!actualBalance) {
      notify('Укажите фактический остаток', 'warning');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/finance/cash-shifts/${activeShift.id}/close/`, {
         actual_balance_at_close: actualBalance,
         notes: notes
      });
      notify('Смена успешно закрыта!', 'success');
      onShiftChanged();
      onClose();
    } catch (err: any) {
      notify('Ошибка закрытия смены', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{activeShift ? 'Закрытие кассовой смены' : 'Открытие кассовой смены'}</DialogTitle>
      <DialogContent dividers>
        {!activeShift ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="body2">Выберите кассу (кошелёк) для открытия смены. Все кассовые операции будут привязаны к ней.</Typography>
            <TextField
              select
              label="Касса"
              fullWidth
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              SelectProps={{ native: true }}
            >
              <option value="">-- Выберите --</option>
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.balance} руб.)</option>
              ))}
            </TextField>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="info">Смена открыта: {new Date(activeShift.opened_at).toLocaleString()}</Alert>
            <Typography variant="body1">Открыл: {activeShift.opened_by_name}</Typography>
            <Typography variant="body1">Остаток при открытии: {activeShift.balance_at_open} руб.</Typography>
            
            <TextField
              label="Фактический остаток в кассе"
              type="number"
              fullWidth
              required
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
            />
            <TextField
              label="Комментарий (необязательно)"
              multiline
              rows={2}
              fullWidth
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Отмена</Button>
        <Button 
          variant="contained" 
          color={activeShift ? "error" : "primary"} 
          onClick={activeShift ? handleCloseShift : handleOpenShift}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : (activeShift ? 'Закрыть смену' : 'Открыть смену')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
