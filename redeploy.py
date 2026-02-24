import paramiko

def run(ssh, command, timeout=120):
    print(f"\n>>> {command}")
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    if out: print(f"OUT:\n{out}")
    if err: print(f"ERR:\n{err}")
    print(f"Exit status: {exit_status}")
    return exit_status

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')

# Pull latest changes
run(ssh, 'cd /root/FLOW && git pull origin main')

# Stop containers
run(ssh, 'cd /root/FLOW && docker compose down')

# Start with new config
run(ssh, 'cd /root/FLOW && docker compose up -d --build')

# Check result
run(ssh, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')

ssh.close()
print("\nDone!")
