import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print("Connecting to server...")
    ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')
    print("Connected!")
    
    # Check docker status
    print("\nChecking container status...")
    stdin, stdout, stderr = ssh.exec_command('cd /root/FLOW && docker compose ps')
    stdout.channel.recv_exit_status()
    print(stdout.read().decode('utf-8'))
    
    # Check backend logs
    print("\nBackend logs (last 50 lines):")
    stdin, stdout, stderr = ssh.exec_command('cd /root/FLOW && docker compose logs backend --tail 50')
    stdout.channel.recv_exit_status()
    print(stdout.read().decode('utf-8'))
    print(stderr.read().decode('utf-8'))
    
finally:
    ssh.close()
