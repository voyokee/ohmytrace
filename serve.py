"""Local development server. Disable module caching while iterating on visuals."""
import argparse
import errno
import json
import threading
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class DevelopmentHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__health':
            data = json.dumps({'app': 'ohmytrace', 'renderer': 'earth', 'version': '2026.10.24'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true', help='Open the preview in your default browser')
    args = parser.parse_args()
    handler = partial(DevelopmentHandler, directory=str(Path(__file__).resolve().parent))
    url = f'http://127.0.0.1:{args.port}/'
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        running = False
        if error.errno == errno.EADDRINUSE:
            try:
                with urllib.request.urlopen(url, timeout=2) as response:
                    page = response.read(16000).decode('utf-8')
                    running = 'id="globe"' in page and '<title>OnceHere</title>' in page
            except Exception:
                pass
        if not running:
            parser.exit(1, f'Port {args.port} is unavailable. Try --port 8766.\n')
        print(f'OnceHere is already running: {url}')
        if args.open:
            webbrowser.open(url)
        raise SystemExit(0)
    with server:
        print(f'OnceHere: http://127.0.0.1:{args.port}/ (development cache disabled)', flush=True)
        if args.open:
            timer = threading.Timer(0.5, webbrowser.open, args=(url,))
            timer.daemon = True
            timer.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
