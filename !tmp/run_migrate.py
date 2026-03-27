import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')

def run(cmd):
    print(f'>>> {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    if out: print(f'OUT: {out}')
    if err: print(f'ERR: {err}')
    print(f'Exit: {exit_status}')
    return exit_status

# Run migrations
run('cd /root/FLOW && docker compose exec backend python manage.py migrate')

# Collect static
run('cd /root/FLOW && docker compose exec backend python manage.py collectstatic --noinput')

# Check containers
run('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')

ssh.close()
print('Done!')
