#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}"; }

log_info "=========================================="
log_info "PostgreSQL Daily Backup v2"
log_info "=========================================="

# Validate required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
  log_error "DATABASE_URL environment variable not set"
  exit 1
fi

if [ -z "${BACKUP_BUCKET:-}" ]; then
  log_error "BACKUP_BUCKET environment variable not set"
  exit 1
fi

if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  log_error "AWS credentials not configured"
  exit 1
fi

log_info "Starting backup process..."

# Create backup directory
BACKUP_DIR="/tmp/postgres_backup"
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/heydoctor_backup_${TIMESTAMP}.sql"
BACKUP_COMPRESSED="${BACKUP_FILE}.gz"

log_info "Timestamp: $TIMESTAMP"

# Add sslmode if not present
if [[ ! "$DATABASE_URL" =~ sslmode ]]; then
  EXPORT_URL="${DATABASE_URL}?sslmode=require"
  log_warning "Added sslmode=require to connection string"
else
  EXPORT_URL="$DATABASE_URL"
fi

# Test connection
log_info "Testing database connection (timeout: 30s)..."
if ! pg_isready -d "$EXPORT_URL" -t 30 > /dev/null 2>&1; then
  log_error "Cannot connect to database"
  log_error "Check: DATABASE_URL, network access, and SSL settings"
  exit 1
fi

log_success "Database connection successful"

# Perform backup
log_info "Performing pg_dump..."
if PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-30}" pg_dump "$EXPORT_URL" > "$BACKUP_FILE" 2>&1; then
  log_success "pg_dump completed"
else
  log_error "pg_dump failed"
  exit 1
fi

# Get backup size before compression
SIZE_BEFORE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "Backup size (uncompressed): $SIZE_BEFORE"

# Compress backup
log_info "Compressing with gzip level 9..."
if gzip -9 "$BACKUP_FILE"; then
  SIZE_AFTER=$(du -h "$BACKUP_COMPRESSED" | cut -f1)
  log_success "Compressed: $SIZE_AFTER"
else
  log_error "Compression failed"
  exit 1
fi

# Upload to S3/R2 using Python boto3
log_info "Uploading to S3/R2: $BACKUP_BUCKET..."

python3 << 'PYTHON_EOF'
import os
import sys
import boto3
from datetime import datetime

try:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_key = f"postgres-backups/heydoctor_backup_{timestamp}.sql.gz"
    backup_file = f"/tmp/postgres_backup/heydoctor_backup_{timestamp}.sql.gz"

    # Create S3 client
    session = boto3.Session(
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    )

    # Configure endpoint if provided (for R2, MinIO, etc.)
    s3_kwargs = {}
    if os.getenv("AWS_ENDPOINT_URL"):
        s3_kwargs["endpoint_url"] = os.getenv("AWS_ENDPOINT_URL")

    s3 = session.client("s3", **s3_kwargs)

    print(f"Uploading {backup_file}")
    print(f"to s3://{os.getenv('BACKUP_BUCKET')}/{backup_key}")

    s3.upload_file(
        backup_file,
        os.getenv("BACKUP_BUCKET"),
        backup_key,
        ExtraArgs={"ServerSideEncryption": "AES256"}
    )
    print(f"✅ Upload successful")

except Exception as e:
    print(f"❌ Upload failed: {str(e)}")
    sys.exit(1)
PYTHON_EOF

if [ $? -ne 0 ]; then
  log_error "Upload to S3/R2 failed"
  exit 1
fi

log_success "Upload completed"

# Clean old backups using Python boto3
log_info "Cleaning backups older than ${BACKUP_RETENTION_DAYS} days..."

python3 << 'PYTHON_CLEANUP'
import os
import boto3
from datetime import datetime, timedelta

try:
    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))
    cutoff_date = datetime.now() - timedelta(days=retention_days)

    session = boto3.Session(
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    )

    s3_kwargs = {}
    if os.getenv("AWS_ENDPOINT_URL"):
        s3_kwargs["endpoint_url"] = os.getenv("AWS_ENDPOINT_URL")

    s3 = session.client("s3", **s3_kwargs)

    response = s3.list_objects_v2(
        Bucket=os.getenv("BACKUP_BUCKET"),
        Prefix="postgres-backups/"
    )

    deleted_count = 0
    if "Contents" in response:
        for obj in response["Contents"]:
            if obj["LastModified"].replace(tzinfo=None) < cutoff_date:
                print(f"Deleting: {obj['Key']}")
                s3.delete_object(Bucket=os.getenv("BACKUP_BUCKET"), Key=obj["Key"])
                deleted_count += 1

    if deleted_count > 0:
        print(f"✅ Deleted {deleted_count} old backup(s)")
    else:
        print("ℹ️  No old backups to delete")

except Exception as e:
    print(f"⚠️  Cleanup warning: {str(e)}")
    # Don't fail if cleanup fails

PYTHON_CLEANUP

# Final cleanup
rm -rf "$BACKUP_DIR"

log_success "=========================================="
log_success "Backup completed successfully!"
log_success "File: heydoctor_backup_${TIMESTAMP}.sql.gz"
log_success "=========================================="
