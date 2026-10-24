"""Local development server. Disable module caching while iterating on visuals."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class DevelopmentHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    handler = partial(DevelopmentHandler, directory=str(Path(__file__).resolve().parent))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'Oh My Trace: http://127.0.0.1:{args.port}/ (development cache disabled)', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
