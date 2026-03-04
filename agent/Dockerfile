# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies (needed for Solana-py, crypto, and Seahorse)
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (to leverage Docker cache)
COPY requirements.txt .

# Install Python dependencies (includes Solana-py, Seahorse, and other crypto libs)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the agent code
COPY . .

# Set environment to Solana Devnet by default
ENV SOLANA_CLUSTER=devnet
ENV RPC_URL=https://api.devnet.solana.com

# Expose the API port (for Frontend communication)
EXPOSE 8080

# Default command: Run the API server
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8080"]
