#!/bin/sh
set -e

echo "Applying PostgreSQL migrations..."
node ./node_modules/prisma/build/index.js migrate deploy

echo "Starting BeautyContent AI server..."
exec node server.js
