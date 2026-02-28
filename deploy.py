import paramiko
import time

def run_command(ssh, command):
    print(f"Running: {command}")
    stdin, stdout, stderr = ssh.exec_command(command)
    
    # Wait for command to finish
    exit_status = stdout.channel.recv_exit_status()
    
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    
    if out: print(f"STDOUT:\n{out.encode('ascii', 'replace').decode('ascii')}")
    if err: print(f"STDERR:\n{err.encode('ascii', 'replace').decode('ascii')}")
    
    if exit_status != 0:
        print(f"Command failed with exit status {exit_status}")
    
    return out, err, exit_status

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print("Connecting to server...")
    ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')
    print("Connected successfully!")
    
    # 1. Create directory and clone repo
    run_command(ssh, 'mkdir -p /root/FLOW')
    
    # Check if repo exists, if so pull, else clone
    out, err, status = run_command(ssh, 'ls /root/FLOW/.git')
    if status == 0:
        print("Repo exists, resetting to latest origin/main...")
        run_command(ssh, 'cd /root/FLOW && git fetch origin && git reset --hard origin/main && git clean -fd')
    else:
        print("Cloning repo...")
        run_command(ssh, 'git clone https://github.com/Rushen88/FLOW.git /root/FLOW')
    
    # 2. Create .env file
    env_content = """
DJANGO_SECRET_KEY=django-insecure-production-key-change-me-later
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=*,130.49.146.199,localhost,127.0.0.1

DB_NAME=FLOW
DB_USER=postgres
DB_PASSWORD=RuSH.73501505wW
DB_HOST=db
DB_PORT=5432
"""
    # Write .env file
    sftp = ssh.open_sftp()
    with sftp.file('/root/FLOW/.env', 'w') as f:
        f.write(env_content)
    sftp.close()
    print("Created .env file on server.")
    
    # 3. Run docker compose
    print("Building and starting Docker containers...")
    run_command(ssh, 'cd /root/FLOW && docker compose up -d --build')
    
    print("Deployment finished!")
    
finally:
    ssh.close()
