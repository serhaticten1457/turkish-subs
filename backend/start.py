import uvicorn
import os
import sys

# Add the project root to sys.path to ensure modules are found
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == "__main__":
    # Freeze support for PyInstaller
    import multiprocessing
    multiprocessing.freeze_support()
    
    # Run the server
    # Important: host must be 0.0.0.0 for Docker containers to be accessible from other containers (nginx)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
