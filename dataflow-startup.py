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

    # Project zip file to be downloaded from the repository
    project_zip_name = "dataflow.zip"
    project_zip_url = f"https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/{project_zip_name}"

    # --- Step 1: Download and Unpack Project ---
    print("\n[1/5] Downloading project files...")
    try:
        subprocess.run(["wget", "-q", "-O", project_zip_name, project_zip_url], check=True)
        subprocess.run(["unzip", "-o", project_zip_name], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Details: {e.stderr.decode()}")
        return

    # --- Step 2: Install Python Dependencies ---
    print("\n[2/5] Installing Python dependencies...")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "python-dotenv"], check=True)
        # Assuming your dataflow.zip contains a requirements.txt file
        if os.path.exists("requirements.txt"):
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
            print("✅ Python dependencies from requirements.txt installed.")
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
        os.chmod("cloudflared", 0o755) # Set executable permissions
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
    print("\n[5/5] Launching Streamlit and creating public URL...")
    try:
        # --- Ensure you have a 'streamlit_app.py' in your dataflow.zip ---
        os.system("streamlit run streamlit_app.py --server.port 8501 --server.address 0.0.0.0 &")
        time.sleep(5) # Give Streamlit a moment to start up

        tunnel_process = subprocess.Popen(
            ["./cloudflared", "tunnel", "--url", "http://localhost:8501", "--no-autoupdate"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        time.sleep(3) # Give cloudflared a moment to establish the tunnel

        public_url = None
        for line in iter(tunnel_process.stderr.readline, ''):
            match = re.search(r"https?://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if match:
                public_url = match.group(0)
                break
        
        if not public_url:
            print("❌ ERROR: Could not find the public URL in cloudflared output.")
            print("   Killing the tunnel process...")
            tunnel_process.kill()
            return
        
        # --- Display Final Information ---
        print("\n" + "="*60)
        print("🎉 LAUNCH COMPLETE! Your Streamlit App is LIVE.")
        print("\n   Your Public URL:")
        print(f"   --> {public_url}")
        print("\n   (No password required!)")
        print("="*60)
        print("\n(This script will keep running to maintain the tunnel. Close it to stop.)")
        
        tunnel_process.wait()

    except Exception as e:
        print(f"❌ ERROR: Failed to launch Streamlit or the tunnel. Details: {e}")
        return

# --- Run the main function ---
if __name__ == "__main__":
    setup_and_launch()
