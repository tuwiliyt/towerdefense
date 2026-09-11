import subprocess
import time
import re
import sys
import os

os.chdir('/content/zombie_tower_defense')

# 1. Start python HTTP server
http_proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', '8000', '--bind', '127.0.0.1'],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)
print(f"[SERVER] HTTP server started on http://127.0.0.1:8000 (PID: {http_proc.pid})", flush=True)

# 2. Start cloudflared tunnel
cf_proc = subprocess.Popen(
    ['/content/zombie_tower_defense/cloudflared', 'tunnel', '--url', 'http://127.0.0.1:8000'],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)
print(f"[TUNNEL] Cloudflared process launched (PID: {cf_proc.pid})", flush=True)

# Monitor output to catch the trycloudflare URL
tunnel_url = None
start_time = time.time()

while time.time() - start_time < 30:
    line = cf_proc.stdout.readline()
    if line:
        print("[CF]", line.strip(), flush=True)
        match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
        if match:
            tunnel_url = match.group(0)
            with open('/content/zombie_tower_defense/tunnel_url.txt', 'w') as f:
                f.write(tunnel_url + '\n')
            print("\n" + "="*60, flush=True)
            print(f"CLOUDFLARE_TUNNEL_URL: {tunnel_url}", flush=True)
            print("="*60 + "\n", flush=True)
            break
    time.sleep(0.05)

# Keep both running indefinitely
try:
    while True:
        if http_proc.poll() is not None:
            print("[SERVER] HTTP server stopped!", flush=True)
            break
        if cf_proc.poll() is not None:
            print("[TUNNEL] Cloudflared tunnel stopped!", flush=True)
            break
        time.sleep(2)
except KeyboardInterrupt:
    http_proc.terminate()
    cf_proc.terminate()
