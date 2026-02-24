import { useState, useEffect } from 'react'
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Avatar, Chip, Divider, Alert, IconButton, InputAdornment,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Save, Visibility, VisibilityOff, Lock, Person, Email,
  Phone, Badge, Business,
} from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  seller: 'Продавец',
  courier: 'Курьер',
  accountant: 'Бухгалтер',
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const { notify } = useNotification()

  // ─── Profile form ───
  const [profileForm, setProfileForm] = useState({
    first_name: '', last_name: '', patronymic: '', email: '', phone: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setProfileForm({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        patronymic: user.patronymic || '',
        email: user.email || '',
        phone: user.phone || '',
      })
    }
  }, [user])

  const saveProfile = async () => {
    setProfileSaving(true)
    try {
      await api.patch('/core/users/me/', profileForm)
      await refreshUser()
      notify('Профиль обновлён')
    } catch (err) {
      notify(extractError(err, 'Ошибка сохранения профиля'), 'error')
    }
    setProfileSaving(false)
  }

  // ─── Password change ───
  const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const canChangePwd = pwdForm.old_password.length > 0
    && pwdForm.new_password.length >= 8
    && pwdForm.new_password === pwdForm.confirm

  const changePassword = async () => {
    if (pwdForm.new_password !== pwdForm.confirm) {
      notify('Пароли не совпадают', 'error')
      return
    }
    setPwdSaving(true)
    try {
      await api.post('/core/users/me/change-password/', {
        old_password: pwdForm.old_password,
        new_password: pwdForm.new_password,
      })
      notify('Пароль успешно изменён')
      setPwdForm({ old_password: '', new_password: '', confirm: '' })
    } catch (err) {
      notify(extractError(err, 'Ошибка смены пароля'), 'error')
    }
    setPwdSaving(false)
  }

  if (!user) return null

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Мой профиль</Typography>

      <Grid container spacing={3}>
        {/* ─── User Info Card ─── */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ textAlign: 'center', py: 3 }}>
            <CardContent>
              <Avatar
                sx={{
                  width: 96, height: 96, mx: 'auto', mb: 2,
                  bgcolor: 'primary.main', fontSize: 40,
                }}
              >
                {user.first_name?.[0] || user.username?.[0] || 'U'}
              </Avatar>
              <Typography variant="h6" fontWeight={600}>
                {user.full_name || user.username}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                @{user.username}
              </Typography>
              <Chip
                label={ROLE_LABELS[user.role] || user.role}
                color={user.role === 'owner' ? 'error' : user.role === 'admin' ? 'warning' : 'primary'}
                size="small"
                sx={{ mb: 2 }}
              />
              {user.organization_name && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 1 }}>
                  <Business fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {user.organization_name}
                  </Typography>
                </Box>
              )}
              {!user.organization && (
                <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                  Вы не привязаны к организации.
                  Создайте организацию в разделе «Настройки».
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ─── Profile Edit ─── */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <Person color="primary" />
                <Typography variant="h6" fontWeight={600}>Личные данные</Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth label="Фамилия" value={profileForm.last_name}
                    onChange={e => setProfileForm(p => ({ ...p, last_name: e.target.value }))}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Badge fontSize="small" /></InputAdornment> } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth label="Имя" value={profileForm.first_name}
                    onChange={e => setProfileForm(p => ({ ...p, first_name: e.target.value }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth label="Отчество" value={profileForm.patronymic}
                    onChange={e => setProfileForm(p => ({ ...p, patronymic: e.target.value }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth label="Email" type="email" value={profileForm.email}
                    onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Email fontSize="small" /></InputAdornment> } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth label="Телефон" value={profileForm.phone}
                    onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Phone fontSize="small" /></InputAdornment> } }}
                  />
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Button
                  variant="contained" startIcon={<Save />}
                  onClick={saveProfile} disabled={profileSaving}
                >
                  Сохранить изменения
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* ─── Password Change ─── */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <Lock color="primary" />
                <Typography variant="h6" fontWeight={600}>Смена пароля</Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth label="Текущий пароль" type={showOld ? 'text' : 'password'}
                    value={pwdForm.old_password}
                    onChange={e => setPwdForm(p => ({ ...p, old_password: e.target.value }))}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowOld(!showOld)}>
                              {showOld ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth label="Новый пароль" type={showNew ? 'text' : 'password'}
                    value={pwdForm.new_password}
                    onChange={e => setPwdForm(p => ({ ...p, new_password: e.target.value }))}
                    helperText="Минимум 8 символов"
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowNew(!showNew)}>
                              {showNew ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth label="Подтвердите пароль" type="password"
                    value={pwdForm.confirm}
                    onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value }))}
                    error={pwdForm.confirm.length > 0 && pwdForm.new_password !== pwdForm.confirm}
                    helperText={pwdForm.confirm.length > 0 && pwdForm.new_password !== pwdForm.confirm ? 'Пароли не совпадают' : ''}
                  />
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Button
                  variant="contained" color="warning" startIcon={<Lock />}
                  onClick={changePassword} disabled={!canChangePwd || pwdSaving}
                >
                  Сменить пароль
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
