import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U', timeout=15)

cmd = "cd /root/FLOW && docker compose logs backend --tail=500"

_, stdout, _ = ssh.exec_command(cmd)
with open("remote_logs.txt", "w", encoding="utf-8") as f:
    f.write(stdout.read().decode('utf-8'))

ssh.close()
