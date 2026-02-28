import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print("Connecting to server...")
    ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')
    print("Connected!")
    
    # Create and apply migrations
    commands = [
        'cd /root/FLOW && docker compose exec -T backend python manage.py makemigrations',
        'cd /root/FLOW && docker compose exec -T backend python manage.py migrate',
    ]
    
    for cmd in commands:
        print(f"\nRunning: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        
        if out: print(f"STDOUT:\n{out}")
        if err: print(f"STDERR:\n{err}")
        
        if exit_status != 0:
            print(f"Command failed with exit status {exit_status}")
    
    print("\nMigrations complete!")
    
finally:
    ssh.close()
