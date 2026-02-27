import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')

# Test HTTP directly from inside docker network
stdin, stdout, stderr = ssh.exec_command(
    'docker exec flow-backend-1 sh -c "wget -qO- http://localhost:8000/api/ 2>&1 | head -20"'
)
print('=== DIRECT HTTP TEST ===')
print(stdout.read().decode())

# Check running processes in backend
stdin, stdout, stderr = ssh.exec_command(
    'docker exec flow-backend-1 sh -c "cat /proc/1/cmdline | tr \"\\0\" \" \"; echo"'
)
print('=== MAIN PROCESS ===')
print(stdout.read().decode())

# List all processes via /proc
stdin, stdout, stderr = ssh.exec_command(
    'docker exec flow-backend-1 sh -c "ls /proc | grep -E \"^[0-9]+$\" | while read p; do cat /proc/$p/cmdline 2>/dev/null | tr \"\\0\" \" \"; echo; done | grep -v \"^$\""'
)
print('=== ALL PROCESSES ===')
print(stdout.read().decode())

ssh.close()
