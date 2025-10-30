# ==============================================================================
# Crawl4AI AGENT - ALL-IN-ONE COLAB LAUNCHER
# ==============================================================================
# INSTRUCTIONS:
# 1. Paste your ngrok authtoken into the NGROK_AUTH_TOKEN variable below.
# 2. Run this cell.
# 3. When prompted, upload your .env file containing the API keys.
# 4. Click the public ngrok URL that appears to access your app.
# ==============================================================================

import os
import sys
import subprocess
from google.colab import files

# --- Step 1: User Configuration ---
# PASTE YOUR NGROK AUTHTOKEN HERE (get it from: https://dashboard.ngrok.com/get-started/your-authtoken)
NGROK_AUTH_TOKEN = "2sgRM7FemgplkDA2ozAMPWLUaVp_81hkgx7wJD17rew3zH62T"


# --- Step 2: Download and Set Up the Project Environment ---
print("🚀 Starting the setup process...")

# Download the project zip file directly from GitHub
print("Downloading project files from GitHub...")
project_zip_url = "https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/crawl4ai-project.zip"
subprocess.run(["wget", "-q", "-O", "crawl4ai-project.zip", project_zip_url], check=True)

# Unzip the project files (the -o flag overwrites existing files without asking)
print("Unzipping project...")
subprocess.run(["unzip", "-o", "crawl4ai-project.zip"], check=True)

# Install required libraries for the launcher and from the project's requirements.txt
print("Installing all dependencies... (This will take a few minutes)")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "pyngrok"], check=True)
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
print("✅ Dependencies installed successfully!")

# Import pyngrok after installation
from pyngrok import ngrok


# --- Step 3: Handle Secrets and Configuration ---

# Configure ngrok
if not NGROK_AUTH_TOKEN:
    print("\n🚨 ERROR: Please paste your ngrok authtoken into the NGROK_AUTH_TOKEN variable at the top of this cell and run it again.")
else:
    print("\nConfiguring ngrok...")
    os.system(f"ngrok config add-authtoken {NGROK_AUTH_TOKEN}")
    print("✅ ngrok configured.")

    # Prompt for the .env file with API keys
    print("\n🔐 Please upload your .env file now:")
    uploaded = files.upload()
    if not uploaded:
        print("\n❌ WARNING: No .env file was uploaded. The agent will fail if it needs API keys.")
    else:
        print("✅ Your .env file has been uploaded for this session.")

    # --- Step 4: Launch the Streamlit Application ---
    print("\n" + "="*50)
    print("🎉 LAUNCHING STREAMLIT APPLICATION...")
    print("="*50)

    # Start the ngrok tunnel to expose the Streamlit port
    public_url = ngrok.connect(8501)
    print(f"\n\n🚀 Your Streamlit App is LIVE at: {public_url}\n\n")

    # Run the Streamlit app in the background
    os.system("streamlit run streamlit_app.py &")
