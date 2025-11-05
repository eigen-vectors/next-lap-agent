# crawl4ai-startup.py
# This script automates the setup and launch of the Crawl4AI Agent on Google Colab,
# exposing the Streamlit application publicly using a Cloudflare Tunnel.

import os
import sys
import subprocess
import time
import re
from dotenv import load_dotenv

def setup_and_launch():
    """
    Downloads the project, installs all dependencies, sets up the Cloudflare Tunnel,
    and launches the Streamlit application.
    """
    print("🚀 Starting the Crawl4AI Agent with Cloudflare Tunnel...")

    # --- Step 1: Download and Unpack the Project ---
    print("\n[1/5] Downloading project files from GitHub...")
    project_zip_name = "crawl4ai-project.zip"
    project_zip_url = f"https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/{project_zip_name}"
    try:
        # Download the project zip
        subprocess.run(["wget", "-q", "-O", project_zip_name, project_zip_url], check=True)
        # Unzip all contents, including the .env file
        subprocess.run(["unzip", "-o", project_zip_name], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Details: {e.stderr.decode()}")
        return

    # --- Step 2: Install Python Dependencies ---
    print("\n[2/5] Installing Python dependencies... (This may take several minutes)")
    try:
        # Install libraries needed for the launcher and the project itself
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "python-dotenv"], check=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
        print("✅ Python dependencies installed.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install Python packages. Details: {e.stderr.decode()}")
        return

    # --- Step 3: Download and Set Up Cloudflared ---
    print("\n[3/5] Setting up Cloudflare Tunnel...")
    try:
        # Download the cloudflared binary for Linux AMD64 (which Colab uses)
        subprocess.run(["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"], check=True)
        # Rename for easier access and make it executable
        os.rename("cloudflared-linux-amd64", "cloudflared")
        os.chmod("cloudflared", 0o755)
        print("✅ cloudflared executable is ready.")
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"❌ ERROR: Failed to set up cloudflared. Details: {e}")
        return

    # --- Step 4: Load Environment Variables ---
    print("\n[4/5] Loading environment variables from .env file...")
    try:
        if not os.path.exists('.env'):
            print("⚠️ WARNING: '.env' file not found in the zip. The app might fail if API keys are needed.")
        else:
            load_dotenv()
            print("✅ Secrets from .env file are loaded into the environment.")
    except Exception as e:
        print(f"❌ ERROR during secret loading: {e}")
        return

    # --- Step 5: Launch Streamlit and Create the Public Tunnel ---
    print("\n[5/5] Launching Streamlit and creating public URL...")
    try:
        # Launch the Streamlit app in the background on port 8501
        os.system("streamlit run streamlit_app.py --server.port 8501 --server.address 0.0.0.0 &")
        # Give Streamlit a few seconds to start up before connecting the tunnel
        time.sleep(5)

        # Start the Cloudflare Tunnel in a subprocess, capturing its output
        tunnel_process = subprocess.Popen(
            ["./cloudflared", "tunnel", "--url", "http://localhost:8501", "--no-autoupdate"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        # Give cloudflared a moment to establish the connection and print the URL
        time.sleep(4)

        public_url = None
        # The URL is usually printed to the standard error stream
        for line in iter(tunnel_process.stderr.readline, ''):
            # Use a regular expression to find the *.trycloudflare.com URL
            match = re.search(r"https?://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if match:
                public_url = match.group(0)
                break # Exit the loop once we've found our URL

        if not public_url:
            print("❌ ERROR: Could not find the public URL in the cloudflared output.")
            print("   Killing the tunnel process...")
            tunnel_process.kill()
            return

        # --- Display Final Information ---
        print("\n" + "="*60)
        print("🎉 LAUNCH COMPLETE! Your Streamlit App is LIVE.")
        print("\n   Your Public URL (no password required):")
        print(f"   --> {public_url}")
        print("="*60)
        print("\n(This Colab cell will keep running to maintain the tunnel. To stop the app, interrupt or close this cell.)")

        # This line will keep the script running, and thus the tunnel alive.
        tunnel_process.wait()

    except Exception as e:
        print(f"❌ ERROR: Failed to launch Streamlit or the tunnel. Details: {e}")
        return

# --- Run the main function ---
if __name__ == "__main__":
    setup_and_launch()
