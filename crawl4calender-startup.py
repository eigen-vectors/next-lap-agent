import os
import sys
import subprocess
import time
from dotenv import load_dotenv

def setup_and_launch():
    """
    Downloads the project, installs dependencies, loads environment variables,
    and launches the Streamlit application exposed via localtunnel.
    """
    print("🚀 Starting the Crawl4Calender Agent fully automated setup...")

    # Define the project file names
    project_zip_name = "crawl4calender-project.zip"
    project_zip_url = f"https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/{project_zip_name}"

    # --- Step 1: Download and Unpack the Project ---
    print("\n[1/5] Downloading project files from GitHub...")
    try:
        subprocess.run(["wget", "-q", "-O", project_zip_name, project_zip_url], check=True)
        # The '-o' flag forces overwrite without prompting.
        subprocess.run(["unzip", "-o", project_zip_name], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Details: {e.stderr.decode()}")
        return

    # --- Step 2: Install Python & Node Dependencies ---
    print("\n[2/5] Installing dependencies... (This will take a few minutes)")
    try:
        # Install Python packages
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "python-dotenv"], check=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
        print("✅ Python dependencies installed.")

        # Install localtunnel using npm
        print("⏳ Installing localtunnel...")
        subprocess.run(["npm", "install", "-g", "localtunnel"], check=True, capture_output=True)
        print("✅ localtunnel installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install dependencies. Details: {e.stderr.decode()}")
        return

    # --- Step 3: Load Environment Variables ---
    print("\n[3/5] Loading environment variables from .env file...")
    try:
        if not os.path.exists('.env'):
            print("⚠️ WARNING: '.env' file not found. The app might fail if it needs API keys.")
        else:
            load_dotenv()
            print("✅ Secrets from .env file are loaded.")
    except Exception as e:
        print(f"❌ ERROR during secret loading: {e}")
        return

    # --- Step 4: Launch the Streamlit App in the Background ---
    print("\n[4/5] Launching the Streamlit application in the background...")
    # The '&' runs the command in the background, allowing the script to continue.
    os.system("streamlit run streamlit_app.py &")
    # Give Streamlit a moment to start up before we connect the tunnel
    time.sleep(5)
    print("✅ Streamlit is running.")

    # --- Step 5: Create Public URL with LocalTunnel ---
    print("\n[5/5] Creating a public URL with localtunnel...")
    try:
        # Start localtunnel and pipe its output to a log file
        lt_process = subprocess.Popen(
            ["lt", "--port", "8501"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Wait a few seconds for localtunnel to generate the URL
        time.sleep(5)

        # Read the URL from the process output
        public_url_line = lt_process.stdout.readline()
        if "your url is:" in public_url_line:
            public_url = public_url_line.split(":")[-1].strip()
            print("\n" + "="*55)
            print("🎉 LAUNCH COMPLETE! Your Streamlit App is LIVE at:")
            print(f"   --> {public_url}")
            print("="*55)
            print("(This script will keep running to maintain the tunnel. Close it to stop.)")
            # Keep the script alive by waiting for the process to end
            lt_process.wait()
        else:
            # If the URL wasn't found, print the error log
            print("❌ ERROR: Could not get public URL from localtunnel.")
            print(f"   Details: {lt_process.stderr.read()}")

    except FileNotFoundError:
        print("❌ ERROR: 'lt' command not found. The localtunnel installation may have failed.")
    except Exception as e:
        print(f"❌ ERROR: Failed to launch localtunnel. Details: {e}")
        return

# --- Run the main function ---
if __name__ == "__main__":
    setup_and_launch()
