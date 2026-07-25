import http.server
import socketserver
import urllib.request
import os
import sys
import webbrowser

PORT = 8000

class CORSProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_GET(self):
        if self.path.startswith('/proxy?url='):
            import json
            target_url = self.path[len('/proxy?url='):]
            target_url = urllib.parse.unquote(target_url)
            try:
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                resp = urllib.request.urlopen(req, timeout=15)
                body = resp.read()
                final_url = resp.url
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'url': final_url, 'ok': True}).encode())
            except Exception as e:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'url': None, 'ok': False, 'error': str(e)}).encode())
            return
        super().do_GET()

    def log_message(self, format, *args):
        if '/proxy' in str(args[0]):
            print(f"  [PROXY] {args[0]}")

import urllib.parse
print("===========================================")
print("  GeoPortal EPMAPAQ - Servidor Local")
print("===========================================")
print(f"\n  Abre en tu navegador: http://localhost:{PORT}\n")
print("  Presiona Ctrl+C para detener.\n")

try:
    webbrowser.open(f'http://localhost:{PORT}')
except:
    pass

with socketserver.TCPServer(("", PORT), CORSProxyHandler) as httpd:
    httpd.serve_forever()
