import sys
from pathlib import Path

# Ensure the backend/ directory is on sys.path so `from app.X import Y` works
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
