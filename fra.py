# Oracle FRA monitoring script
import cx_Oracle
import os
import sys
from dotenv import load_dotenv
import argparse

# Parse command line arguments
parser = argparse.ArgumentParser(description='Check Flash Recovery Area usage')
parser.add_argument('--db', choices=['db1', 'db2'], default='db1', help='Database to check')
args = parser.parse_args()

# Set the correct Oracle client path
client_path = os.path.expanduser("~/oracle/instantclient_21_19")
try:
    cx_Oracle.init_oracle_client(lib_dir=client_path)
except Exception as e:
    print(f"Error initializing Oracle client: {e}")
    sys.exit(1)

load_dotenv()

# Oracle database connection details based on selected DB
if args.db == 'db1':
    username = os.getenv('DB1_USER')
    password = os.getenv('DB1_PASSWORD')
    dsn = os.getenv('DB1_DSN')
    db_name = os.getenv('DB1_NAME')
else:
    username = os.getenv('DB2_USER')
    password = os.getenv('DB2_PASSWORD')
    dsn = os.getenv('DB2_DSN')
    db_name = os.getenv('DB2_NAME')

def get_fra_usage():
    try:
        connection = cx_Oracle.connect(username, password, dsn)
        cursor = connection.cursor()

        query = """
        SELECT
            name,
            ROUND(space_limit/1024/1024,2) AS limit_mb,
            ROUND(space_used/1024/1024,2) AS used_mb,
            ROUND(space_reclaimable/1024/1024,2) AS reclaimable_mb,
            ROUND(((space_used-space_reclaimable)/space_limit)*100,2) AS used_percent
        FROM
            V$RECOVERY_FILE_DEST
        """

        cursor.execute(query)
        results = cursor.fetchall()

        output = f"FLASH RECOVERY AREA USAGE REPORT - {db_name}\n"
        output += "=" * 80 + "\n"
        output += f"{'NAME':<30} {'LIMIT (MB)':<15} {'USED (MB)':<15} {'RECLAIMABLE (MB)':<20} {'USED %':<10}\n"
        output += "-" * 80 + "\n"

        for row in results:
            output += f"{row[0]:<30} {row[1]:<15.2f} {row[2]:<15.2f} {row[3]:<20.2f} {row[4]:<10.2f}\n"

        cursor.close()
        connection.close()

        return output

    except Exception as e:
        return f"Error retrieving FRA information: {str(e)}"

if __name__ == "__main__":
    print(get_fra_usage())
