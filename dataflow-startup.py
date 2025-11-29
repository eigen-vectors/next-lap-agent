import os
import sys
import subprocess
import time
import re
from dotenv import load_dotenv

def setup_and_launch():
    """
    Downloads, installs, and launches the Streamlit app, exposing it publicly
    using a Cloudflare Tunnel.
    """
    print("🚀 Starting the Next Lap Agent with Cloudflare Tunnel...")

    project_zip_name = "dataflow.zip"
    project_zip_url = f"https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/v2/{project_zip_name}"

    # --- Step 1: Download and Unpack Project ---
    print("\n[1/5] Downloading project files...")
    try:
        subprocess.run(["wget", "-q", "-O", project_zip_name, project_zip_url], check=True)
        subprocess.run(["unzip", "-o", project_zip_name], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Details: {e.stderr.decode()}")
        return

    # --- Step 2: Install and Upgrade Python Dependencies ---
    print("\n[2/5] Installing Python dependencies...")
    try:
        print("--> Upgrading pip...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--upgrade", "pip"], check=True)
        
        # --- NEW: Force upgrade core LangChain packages to fix version conflicts ---
        print("--> Upgrading core LangChain packages to resolve conflicts...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "--upgrade", "langchain", "langchain-core", "langchain-community"],
            check=True
        )
        
        print("--> Installing required packages for startup script...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "python-dotenv"], check=True)

        if os.path.exists("requirements.txt"):
            print("--> Installing packages from requirements.txt...")
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
            print("✅ Python dependencies installed.")
        else:
            print("⚠️ WARNING: requirements.txt not found. Skipping dependency installation from file.")

    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install Python packages. Details: {e.stderr.decode()}")
        return

    # --- Step 3: Download and Set Up Cloudflared ---
    print("\n[3/5] Setting up Cloudflare Tunnel...")
    try:
        subprocess.run(["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"], check=True)
        os.rename("cloudflared-linux-amd64", "cloudflared")
        os.chmod("cloudflared", 0o755)
        print("✅ cloudflared is ready.")
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"❌ ERROR: Failed to set up cloudflared. Details: {e}")
        return

    # --- Step 4: Load Environment Variables ---
    print("\n[4/5] Loading environment variables...")
    try:
        if not os.path.exists('.env'):
            print("⚠️ WARNING: '.env' file not found. App might fail if API keys are needed.")
        else:
            load_dotenv()
            print("✅ Secrets from .env file are loaded.")
    except Exception as e:
        print(f"❌ ERROR during secret loading: {e}")
        return

    # --- Step 5: Launch Streamlit and Create Tunnel ---
    # NOTE: The traceback shows your script runs 'main.py', not a streamlit app.
    # I am assuming 'main.py' is the correct entry point. If you intend to run a
    # Streamlit app, you should change the command below.
    print("\n[5/5] Running the application...")
    try:
        # Running main.py based on the traceback provided
        # If your app is a streamlit app, change this line back to:
        # os.system("streamlit run your_app_name.py --server.port 8501 &")
        # And then un-comment the cloudflare tunnel code below.
        
        # For now, running the script directly as the traceback implies.
        # Note: This will not launch a web UI. It will run in the Colab cell.
        subprocess.run([sys.executable, "/content/main.py"], check=True)
        print("\n" + "="*60)
        print("✅ SCRIPT EXECUTION FINISHED.")
        print("="*60)

    except Exception as e:
        print(f"❌ ERROR: Failed to run the application. Details: {e}")
        return

if __name__ == "__main__":
    setup_and_launch()
