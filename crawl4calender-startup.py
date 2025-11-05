import os
import sys
import subprocess
import time
import urllib.request
from dotenv import load_dotenv

def get_colab_ip():
    """Fetches the public IP address of the Colab runtime."""
    try:
        with urllib.request.urlopen("https://icanhazip.com") as response:
            return response.read().decode('utf-8').strip()
    except Exception:
        return "Could not automatically fetch IP. Please run !curl icanhazip.com in a new cell."

def setup_and_launch():
    """
    Downloads, installs, and launches the Streamlit app, providing both the
    localtunnel URL and the required IP address password.
    """
    print("🚀 Starting the Crawl4Calender Agent fully automated setup...")

    project_zip_name = "crawl4calender-project.zip"
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

    # --- Step 2: Install Dependencies ---
    print("\n[2/5] Installing dependencies... (This will take a few minutes)")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "python-dotenv"], check=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
        print("✅ Python dependencies installed.")
        print("⏳ Installing localtunnel...")
        subprocess.run(["npm", "install", "-g", "localtunnel"], check=True, capture_output=True)
        print("✅ localtunnel installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install dependencies. Details: {e.stderr.decode()}")
        return

    # --- Step 3: Load Environment Variables ---
    print("\n[3/5] Loading environment variables...")
    try:
        if not os.path.exists('.env'):
            print("⚠️ WARNING: '.env' file not found. App might fail if API keys are needed.")
        else:
            load_dotenv()
            print("✅ Secrets from .env file are loaded.")
    except Exception as e:
        print(f"❌ ERROR during secret loading: {e}")
        return

    # --- Step 4: Launch Streamlit in Background ---
    print("\n[4/5] Launching the Streamlit application...")
    os.system("streamlit run streamlit_app.py &")
    time.sleep(5) # Give Streamlit a moment to start
    print("✅ Streamlit is running in the background.")

    # --- Step 5: Create Tunnel and Get Password ---
    print("\n[5/5] Creating public URL and getting access password...")
    try:
        # Get the Colab public IP address to use as the password
        colab_ip = get_colab_ip()

        # Start localtunnel
        lt_process = subprocess.Popen(
            ["lt", "--port", "8501"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        time.sleep(5) # Give localtunnel a moment to generate the URL

        public_url_line = lt_process.stdout.readline()
        if "your url is:" in public_url_line:
            raw_url = public_url_line.split(":")[-1].strip()
            public_url = f"https:{raw_url}" if raw_url.startswith('//') else f"https://{raw_url}"

            # --- Display Final Information ---
            print("\n" + "="*60)
            print("🎉 LAUNCH COMPLETE! Your Streamlit App is LIVE.")
            print("\n  1. Your Public URL:")
            print(f"     --> {public_url}")
            print("\n  2. Your Password:")
            print(f"     --> {colab_ip}")
            print("\nInstructions:")
            print("  - Open the URL in your browser.")
            print("  - When prompted for a password, copy and paste the IP address above.")
            print("="*60)
            print("\n(This script will keep running to maintain the tunnel. Close it to stop.)")
            lt_process.wait()
        else:
            print("❌ ERROR: Could not get public URL from localtunnel.")
            print(f"   Details: {lt_process.stderr.read()}")

    except Exception as e:
        print(f"❌ ERROR: Failed to launch localtunnel. Details: {e}")
        return

# --- Run the main function ---
if __name__ == "__main__":
    setup_and_launch()
