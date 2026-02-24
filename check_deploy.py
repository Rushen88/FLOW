import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')

# Check if deploy is still running in background
stdin, stdout, stderr = ssh.exec_command('pgrep -f "docker compose" && echo "RUNNING" || echo "DONE"')
status = stdout.read().decode().strip()
print("Deploy process:", status)

# Check containers
stdin, stdout, stderr = ssh.exec_command('docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
print("Containers:")
print(stdout.read().decode())

# Show last lines of deploy log
stdin, stdout, stderr = ssh.exec_command('tail -40 /root/deploy.log 2>/dev/null')
log = stdout.read().decode()
if log:
    print("Last 40 lines of deploy log:")
    print(log)

ssh.close()
