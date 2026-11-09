import sys
from pathlib import Path

# Make the backend folder importable as the root (so `services` and `main` resolve).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
