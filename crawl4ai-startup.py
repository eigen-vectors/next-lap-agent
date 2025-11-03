# crawl4ai-startup.py
# This script automates the entire setup and launch process for the Crawl4AI Agent on Google Colab.
# It expects the .env file to be included within the project zip file.

import os
import sys
import subprocess
from getpass import getpass
from google.colab import files
from pyngrok import ngrok

def setup_and_launch():
    """
    Downloads the project, installs dependencies, configures secrets,
    and launches the Streamlit application.
    """
    print("🚀 Starting the Crawl4AI Agent setup process...")

    # --- Step 1: Download and Unpack the Project ---
    print("\n[1/4] Downloading project files from GitHub...")
    project_zip_url = "https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/crawl4ai-project.zip"
    try:
        subprocess.run(["wget", "-q", "-O", "crawl4ai-project.zip", project_zip_url], check=True)
        # The unzip command will extract all files, including the .env file
        subprocess.run(["unzip", "-o", "crawl4ai-project.zip"], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Please check the URL. Details: {e.stderr.decode()}")
        return

    # --- Step 2: Install All Dependencies ---
    print("\n[2/4] Installing all dependencies... (This will take a few minutes)")
    try:
        # Install launcher-specific libraries and then all project requirements
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "pyngrok"], check=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
        print("✅ Dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install Python packages. Details: {e.stderr.decode()}")
        return

    # --- Step 3: Configure Secrets (ngrok & .env) ---
    print("\n[3/4] Configuring secrets...")
    try:
        ngrok_token = getpass("🔑 Please enter your ngrok authtoken (from dashboard.ngrok.com): ")
        if not ngrok_token:
            print("❌ ERROR: ngrok authtoken is required. Aborting.")
            return
        os.system(f"ngrok config add-authtoken {ngrok_token}")
        print("✅ ngrok configured.")

        # Verify that the .env file was included in the zip
        if os.path.exists('.env'):
            print("✅ .env file successfully found in the project zip.")
        else:
            print("\n❌ CRITICAL WARNING: '.env' file not found in the zip file.")
            print("   The application will likely fail due to missing API keys.")
            print("   Please add your .env file to the 'crawl4ai-project.zip' and try again.")

    except Exception as e:
        print(f"❌ ERROR during secret configuration: {e}")
        return

    # --- Step 4: Launch the Streamlit App ---
    print("\n[4/4] Launching the Streamlit application...")
    try:
        public_url = ngrok.connect(8501)
        print("\n" + "="*55)
        print("🎉 LAUNCH COMPLETE! Your Streamlit App is LIVE at:")
        print(f"   --> {public_url}")
        print("="*55)
        os.system("streamlit run streamlit_app.py &")
    except Exception as e:
        print(f"❌ ERROR: Failed to launch Streamlit or ngrok. Details: {e}")
        return

# --- Run the main function ---
if __name__ == "__main__":
    setup_and_launch()
