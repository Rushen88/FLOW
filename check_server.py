import paramiko

def run_command(ssh, command):
    print(f"Running: {command}")
    stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    if out: print(f"STDOUT:\n{out}")
    if err: print(f"STDERR:\n{err}")
    return out, err

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')
    print("Connected successfully!")
    run_command(ssh, 'cat /etc/os-release')
    run_command(ssh, 'git --version')
    run_command(ssh, 'python3 --version')
    run_command(ssh, 'node --version')
    run_command(ssh, 'docker --version')
    run_command(ssh, 'docker compose version')
finally:
    ssh.close()
