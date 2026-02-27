import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')

# Script to create superuser
script_content = """from django.contrib.auth import get_user_model
U = get_user_model()
if U.objects.filter(username='admin').exists():
    u = U.objects.get(username='admin')
    u.set_password('73501505wW')
    u.save()
    print('Password updated!')
else:
    u = U.objects.create_superuser(username='admin', email='admin@flow.local', password='73501505wW')
    print('Superuser created!')
"""

# Write script to the server
sftp = ssh.open_sftp()
with sftp.file('/tmp/create_su.py', 'w') as f:
    f.write(script_content)
sftp.close()

# Copy script into container
stdin, stdout, stderr = ssh.exec_command('docker cp /tmp/create_su.py flow-backend-1:/tmp/create_su.py')
stdout.channel.recv_exit_status()

# Run script via manage.py shell
stdin, stdout, stderr = ssh.exec_command(
    'docker exec flow-backend-1 sh -c "python manage.py shell < /tmp/create_su.py"'
)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print('RESULT:', out)
if err: print('ERR:', err)

ssh.close()
