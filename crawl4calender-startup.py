import os
import sys
import subprocess
import time # Import for the persistence loop
from dotenv import load_dotenv
from pyngrok import ngrok

# --- Configuration ---
PROJECT_NAME = "crawl4calender"
PROJECT_ZIP = f"{PROJECT_NAME}-project.zip"
# Assuming the main application file inside the zip is still named 'streamlit_app.py' 
# If your main file is named 'Crawl4Calender.py' you must update this:
STREAMLIT_APP_FILE = "streamlit_app.py" 

def setup_and_launch():
    """
    Downloads the project, installs dependencies, finds and uses secrets from the
    .env file, and launches the Streamlit application with zero manual input.
    """
    print(f"🚀 Starting the {PROJECT_NAME} Agent fully automated setup...")

    # --- Step 1: Download and Unpack the Project ---
    print("\n[1/5] Downloading project files from GitHub...")
    # NOTE: The zip file URL is updated here
    project_zip_url = f"https://raw.githubusercontent.com/eigen-vectors/next-lap-agent/main/{PROJECT_ZIP}"
    try:
        # Download the new zip file
        subprocess.run(["wget", "-q", "-O", PROJECT_ZIP, project_zip_url], check=True)
        # Unzip the project files (assuming they extract to the current directory)
        subprocess.run(["unzip", "-o", PROJECT_ZIP], check=True, capture_output=True)
        print("✅ Project files are ready.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to download or unzip project. Details: {e.stderr.decode()}")
        return

    # --- Step 2: Install Base Dependencies (for the script itself) ---
    print("\n[2/5] Installing base dependencies (pyngrok, streamlit, dotenv)...")
    try:
        # Install base packages required by the script/app
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "streamlit", "pyngrok", "python-dotenv"], check=True)
        print("✅ Base dependencies installed.")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install Python packages. Details: {e.stderr.decode()}")
        return
        
    # --- Step 3: Install Project Dependencies ---
    print("\n[3/5] Installing project-specific dependencies... (from requirements.txt)")
    try:
        if not os.path.exists('requirements.txt'):
             print("⚠️ WARNING: 'requirements.txt' not found. Skipping project dependency install.")
        else:
            # Install project requirements
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
            print("✅ Project dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to install project packages. Details: {e.stderr.decode()}")
        return

    # --- Step 4: Load Secrets and Configure Ngrok ---
    print("\n[4/5] Loading secrets and configuring ngrok...")
    try:
        if not os.path.exists('.env'):
            print("❌ ERROR: '.env' file not found in the project zip. Cannot proceed.")
            return

        load_dotenv()
        ngrok_token = os.getenv("NGROK_AUTH_TOKEN")

        if not ngrok_token:
            print("❌ ERROR: 'NGROK_AUTH_TOKEN' not found in your .env file. Aborting.")
            return

        # Use pyngrok's method to set the token
        ngrok.set_auth_token(ngrok_token)
        print("✅ ngrok configured successfully using the token from .env file.")

    except Exception as e:
        print(f"❌ ERROR during secret configuration: {e}")
        return

    # --- Step 5: Launch the Streamlit App and Tunnel ---
    print("\n[5/5] Launching the Streamlit application and establishing tunnel...")
    try:
        # Use Popen to launch Streamlit in the background, non-blocking
        streamlit_command = [
            sys.executable, "-m", "streamlit", "run", STREAMLIT_APP_FILE, 
            "--server.port", "8501", 
            "--server.headless", "true" # Important for non-browser environments like Colab
        ]
        # Launch the process. start_new_session is good practice.
        subprocess.Popen(streamlit_command, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Give Streamlit a few seconds to start up
        time.sleep(5) 

        # Establish the ngrok tunnel
        public_url = ngrok.connect(8501).public_url
        
        print("\n" + "="*55)
        print("🎉 LAUNCH COMPLETE! Your Streamlit App is LIVE at:")
        print(f"   --> {public_url}")
        print("   (Keep this Colab tab open to maintain the tunnel)")
        print("="*55)

        # Persistence Loop: This loop keeps the Python script running, which maintains the ngrok tunnel.
        print("\nScript running perpetually to keep the tunnel alive...")
        while True:
            time.sleep(3600) # Sleep for 1 hour, loop forever

    except KeyboardInterrupt:
        print("\nKeyboard Interrupt detected. Shutting down...")
        ngrok.kill() # Clean up ngrok processes
    except Exception as e:
        print(f"❌ ERROR: Failed to launch Streamlit or ngrok. Details: {e}")
        ngrok.kill() # Ensure cleanup on error

# --- Run the main function ---
if __name__ == "__main__":
    setup_and_launch()
