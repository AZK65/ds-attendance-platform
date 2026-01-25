#!/bin/bash
set -e

echo "=== DS Attendance Platform - Setup ==="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. You may need to log out and back in for group changes."
    echo "Then run this script again."
    exit 0
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "ERROR: docker compose not found. Please update Docker."
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    echo "Please enter your credentials:"
    read -p "ZOOM_ACCOUNT_ID: " ZOOM_ACCOUNT_ID
    read -p "ZOOM_CLIENT_ID: " ZOOM_CLIENT_ID
    read -p "ZOOM_CLIENT_SECRET: " ZOOM_CLIENT_SECRET
    read -p "AUTH_PASSWORD (login password for the app): " AUTH_PASSWORD

    cat > .env << EOF
ZOOM_ACCOUNT_ID=$ZOOM_ACCOUNT_ID
ZOOM_CLIENT_ID=$ZOOM_CLIENT_ID
ZOOM_CLIENT_SECRET=$ZOOM_CLIENT_SECRET
AUTH_PASSWORD=$AUTH_PASSWORD
DATABASE_URL=file:/app/data/prod.db
EOF
    echo ".env file created."
else
    echo ".env file already exists, skipping..."
fi

echo ""
echo "Building and starting the app..."
docker compose up -d --build

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Your app is running at: http://$(curl -s ifconfig.me):3000"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f     # View logs"
echo "  docker compose restart     # Restart the app"
echo "  docker compose down        # Stop the app"
echo "  docker compose up -d --build  # Rebuild and restart"
