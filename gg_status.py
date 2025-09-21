#!/usr/bin/env python
# filepath: GoldenGate/gg_status.py

import argparse
import subprocess
import os
from dotenv import load_dotenv

def run_ssh_command(host, command):
    """Run a command on a remote host via SSH with sudo to ggudb"""
    # Go back to using shell=True since it was working before
    ssh_command = f"ssh -tt pulseuser@{host} 'sudo su - ggudb -c \"{command}\"'"
    try:
        result = subprocess.run(
            ssh_command,
            shell=True,  # Use shell=True again
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE,
            universal_newlines=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        return f"Error executing command: {e.stderr}"

def run_ggsci_command(host, command):
    """Run a GGSCI command on the remote host"""
    # Escape double quotes in the command
    command = command.replace('"', '\\"')
    # Create a temporary script with the GGSCI commands
    gg_script = f"echo '{command}' | ggsci"
    return run_ssh_command(host, gg_script)

def get_info_all(host):
    """Get status of all GoldenGate processes"""
    return run_ggsci_command(host, "info all")

def get_info_credentialstore(host):
    """Get information about credential stores"""
    return run_ggsci_command(host, "info credentialstore")

def get_lag_info(host, credentialstore):
    """Login to credential store and get lag information"""
    # Create a shell script file on the remote server for better command execution
    temp_script = """#!/bin/bash
# Create a temporary file with GGSCI commands
cat > /tmp/gg_commands.txt << 'EOF'
dblogin useridalias {cred}
lag
info all
exit
EOF

# Run GGSCI with the commands file
ggsci < /tmp/gg_commands.txt
rm -f /tmp/gg_commands.txt
""".format(cred=credentialstore)

    return run_ssh_command(host, temp_script)

def main():
    parser = argparse.ArgumentParser(description='Check GoldenGate status')
    parser.add_argument('--host', choices=['gg1', 'gg2'], required=True,
                        help='GoldenGate host (gg1=testdb-ho-03, gg2=testdb-ho-06)')
    parser.add_argument('--command', choices=['info', 'credstore', 'lag'], required=True,
                        help='Command to run')
    parser.add_argument('--credstore', help='Credential store alias for lag command')

    args = parser.parse_args()

    # Load environment variables
    load_dotenv()

    # Get hostname from environment variables
    if args.host == 'gg1':
        hostname = os.getenv('GG1_HOST', 'testdb-ho-03.com')
    else:
        hostname = os.getenv('GG2_HOST', 'testdb-ho-06.com')

    # Run the requested command
    if args.command == 'info':
        result = get_info_all(hostname)
        print(result)
    elif args.command == 'credstore':
        result = get_info_credentialstore(hostname)
        print(result)
    elif args.command == 'lag':
        if not args.credstore:
            print("Error: --credstore is required for lag command")
            return
        result = get_lag_info(hostname, args.credstore)
        print(result)

if __name__ == "__main__":
    main()
