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
log_info "PostgreSQL Connection Verification"
log_info "=========================================="

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  log_error "DATABASE_URL environment variable not set"
  log_info "Set it with: export DATABASE_URL='postgresql://user:pass@host:port/dbname'"
  exit 1
fi

log_info "Database URL: ${DATABASE_URL:0:50}..."

# Add sslmode=require if not present
if [[ ! "$DATABASE_URL" =~ sslmode ]]; then
  TEST_URL="${DATABASE_URL}?sslmode=require"
  log_warning "sslmode not detected, adding sslmode=require"
else
  TEST_URL="$DATABASE_URL"
fi

# Test connection
log_info "Testing connection (timeout: 30 seconds)..."
if pg_isready -d "$TEST_URL" -t 30 > /dev/null 2>&1; then
  log_success "Connection successful!"
  
  # Get database info
  log_info "Fetching database information..."
  psql "$TEST_URL" -c "
    SELECT 
      datname as 'Database',
      pg_size_pretty(pg_database_size(datname)) as 'Size',
      (SELECT count(*) FROM pg_stat_activity WHERE datname = 'template1') as 'Connections'
    WHERE datname = current_database();
  " 2>/dev/null || log_warning "Could not fetch database stats"
  
else
  log_error "Connection failed!"
  log_info "Troubleshooting steps:"
  echo "  1. Verify DATABASE_URL format: postgresql://user:pass@host:port/dbname"
  echo "  2. Check if database is accessible from GitHub Actions"
  echo "  3. Verify credentials are correct"
  echo "  4. Ensure SSL is properly configured if required"
  exit 1
fi

log_success "Verification completed!"
