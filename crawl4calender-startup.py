import os
import sys
import subprocess
from dotenv import load_dotenv
from pyngrok import ngrok

def setup_and_launch():
    """
    Downloads the project, installs dependencies, finds and uses secrets from the
    .env file, and launches the Streamlit application with zero manual input.
    """
    print("🚀 Starting the Crawl4Calender Agent fully automated setup...")

    # Define the project file names
    project_zip_name = "crawl4calender-project.zip"
    project_zip_url = f"https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/{project_zip_name}"

    # --- Step 1: Download and Unpack the Project ---
    print("\n[1/4] Downloading project files from GitHub...")
    try:
        subprocess.run(["wget", "-q", "-O", project_zip_name, project_zip_url], check=True)

        # THIS IS THE FIX: The "-o" flag overwrites files without asking.
        subprocess.run(["unzip", "-o", project_zip_name], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Details: {e.stderr.decode()}")
        # THIS IS THE FIX: 'return' correctly stops the function.
        return

    # --- Step 2: Install All Dependencies ---
    print("\n[2/4] Installing all dependencies... (This will take a few moments)")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "pyngrok", "python-dotenv"], check=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
        print("✅ Dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install Python packages. Details: {e.stderr.decode()}")
        return

    # --- Step 3: Load Secrets and Configure Ngrok ---
    print("\n[3/4] Loading secrets and configuring ngrok...")
    try:
        if not os.path.exists('.env'):
            print("❌ ERROR: '.env' file not found in the project zip. Cannot proceed.")
            return

        load_dotenv()
        ngrok_token = os.getenv("NGROK_AUTH_TOKEN")

        if not ngrok_token:
            print("❌ ERROR: 'NGROK_AUTH_TOKEN' not found in your .env file. Aborting.")
            return

        os.system(f"ngrok config add-authtoken {ngrok_token}")
        print("✅ ngrok configured successfully using the token from .env file.")

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
