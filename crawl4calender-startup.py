import os
import sys  # <--- NEW: Imported sys for sys.exit
import subprocess
import time
import re
from pyngrok import ngrok, conf
from dotenv import load_dotenv

# --- Configuration ---
GITHUB_REPO_OWNER = "eigen-vectors"
GITHUB_REPO_NAME = "next-lap-agent"
GITHUB_BRANCH = "main"
PROJECT_NAME = "crawl4calender"
PROJECT_DIR = f"{PROJECT_NAME}-project"
PROJECT_ZIP = f"{PROJECT_DIR}.zip"
STREAMLIT_APP_FILE = "Crawl4Calender.py" # IMPORTANT: Update this if your main Streamlit file has a different name
STREAMLIT_PORT = 8501

# Construct the raw file URL for the zip file
REPO_BASE_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}/{GITHUB_BRANCH}/"
PROJECT_ZIP_URL = REPO_BASE_URL + PROJECT_ZIP

# --- Helper Functions ---

def execute_command(command, description):
    """Executes a shell command and prints the status."""
    print(f"\n--- {description} ---")
    try:
        # Use subprocess.run for better control and error handling
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        # Optional: Print output if needed
        # print(result.stdout)
        print("SUCCESS")
    except subprocess.CalledProcessError as e:
        print(f"ERROR executing command: {command}")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        # If the unzip failed, this provides better diagnostic info
        if "unzip" in command:
            print("\n*** UNZIP DIAGNOSTIC MESSAGE ***")
            print("The unzip command failed. This usually means the zip file (crawl4calender-project.zip)")
            print("is corrupt, empty, or not found on GitHub. Please verify the uploaded file.")
            print("*******************************\n")

        # Corrected: Use sys.exit to stop script execution
        sys.exit(1)
    except FileNotFoundError:
        print(f"ERROR: Command not found. Is it installed? Command: {command}")
        sys.exit(1)


def setup_ngrok_tunnel():
    """Reads NGROK_AUTH_TOKEN and sets up the tunnel."""
    print("\n--- Ngrok Setup and Tunneling ---")

    # The .env file is inside the unzipped project directory
    dotenv_path = os.path.join(PROJECT_DIR, ".env")

    if not os.path.exists(dotenv_path):
        print(f"ERROR: .env file not found at {dotenv_path}. Please ensure it is in the zip.")
        sys.exit(1)

    # Load environment variables from the .env file in the project folder
    load_dotenv(dotenv_path=dotenv_path)

    ngrok_token = os.getenv("NGROK_AUTH_TOKEN")
    
    if not ngrok_token:
        print("ERROR: NGROK_AUTH_TOKEN not found in the .env file.")
        print("Please obtain one from https://ngrok.com and add it to your .env.")
        sys.exit(1)

    # Set the token and connect
    conf.get_default().auth_token = ngrok_token
    conf.get_default().log_level = 40 # Set to WARNING to suppress excessive logging

    try:
        # Connect to the Streamlit port
        public_url = ngrok.connect(STREAMLIT_PORT)
        print("\n✅ Ngrok Tunnel Established!")
        print(f"🌍 Your Streamlit Application is accessible at: {public_url}")
        print("\nNote: Keep this Colab tab open to maintain the tunnel.")
        return public_url
    except Exception as e:
        print(f"ERROR connecting with ngrok: {e}")
        # Check for common ngrok authentication issue
        if "Authentication failed" in str(e):
             print("\n*** Ngrok Authentication Error ***")
             print("The provided NGROK_AUTH_TOKEN seems invalid. Check your .env file.")
        sys.exit(1)


def launch_streamlit():
    """Launches the Streamlit application in the background."""
    print("\n--- Launching Streamlit Application ---")
    
    app_path = os.path.join(PROJECT_DIR, STREAMLIT_APP_FILE)
    if not os.path.exists(app_path):
        print(f"ERROR: Streamlit app file not found at {app_path}. Check the STREAMLIT_APP_FILE constant.")
        sys.exit(1)
        
    # Command to run Streamlit
    command = [
        "streamlit", "run", app_path,
        f"--server.port={STREAMLIT_PORT}",
        "--server.headless=true"
    ]
    
    # Launch in a new process group (using preexec_fn) to allow for easier cleanup if needed
    # We use subprocess.Popen to run it in the background
    streamlit_process = subprocess.Popen(
        command,
        # Suppress STDOUT/STDERR to keep the Colab output clean
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True 
    )
    
    print(f"Streamlit process started with PID: {streamlit_process.pid}")
    print(f"Waiting a few seconds for Streamlit to initialize...")
    time.sleep(5) # Give Streamlit a moment to start
    
    return streamlit_process

# --- Main Execution ---

if __name__ == "__main__":
    
    # 1. Download the project zip
    execute_command(
        f"wget -q {PROJECT_ZIP_URL}", 
        f"Downloading {PROJECT_ZIP} from GitHub"
    )
    
    # 2. Unzip the project (This is where the CalledProcessError occurred)
    execute_command(
        f"unzip -q {PROJECT_ZIP} -d .", 
        f"Unzipping {PROJECT_ZIP} to {PROJECT_DIR}"
    )

    # 3. Install dependencies
    requirements_path = os.path.join(PROJECT_DIR, "requirements.txt")
    if not os.path.exists(requirements_path):
         print(f"WARNING: requirements.txt not found at {requirements_path}. Skipping pip install.")
    else:
        # Install project requirements
        execute_command(
            f"pip install -r {requirements_path}", 
            "Installing Project Dependencies"
        )

    # 4. Install ngrok library if not already present in the environment (common in Colab)
    execute_command(
        "pip install pyngrok",
        "Installing pyngrok library"
    )

    # 5. Launch Streamlit
    streamlit_proc = launch_streamlit()
    
    # 6. Setup Ngrok Tunnel and print URL
    public_url = setup_ngrok_tunnel()
    
    # Keep the Colab notebook running indefinitely to keep the server alive
    try:
        while True:
            time.sleep(3600) # Sleep for 1 hour, loop forever
    except KeyboardInterrupt:
        print("\nKeyboard Interrupt detected. Shutting down...")
        ngrok.disconnect(public_url)
        # Terminate the streamlit process
        if streamlit_proc:
             try:
                 streamlit_proc.terminate()
                 print("Streamlit process terminated.")
             except:
                 pass # Already dead or error
        print("Cleanup complete. Session finished.")
