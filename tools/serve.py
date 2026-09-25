#!/usr/bin/env python3
"""Local dev server for Horse Tinder. A trimmed port of mbrd's tools/serve.py.

Serves www/ (the same folder Capacitor copies into the APK), binds 0.0.0.0 so a
phone on the same Wi-Fi can open it, and prints a QR for the LAN URL.
Run: python tools/serve.py [port] [lan-ip]  (defaults to 46773)
"""
import os
import socket
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# The QR encoder lives beside this file - see qr.py.
from qr import qr_terminal

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 46773
# Resolved from __file__, not the working directory, so the launch directory never matters.
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'www')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.woff2': 'font/woff2',
        '.svg': 'image/svg+xml',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Local dev only: a single refresh always shows the latest edit.
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    # A reload aborts in-flight requests; on Windows that surfaces as a reset
    # mid-write. The client is gone, so there is nothing to report.
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.close_connection = True

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def log_error(self, fmt, *args):
        try:
            message = fmt % args
        except Exception:
            message = str(fmt)
        if 'Bad request' in message or 'Request timed out' in message:
            return
        super().log_error('%s', message)


def _lan_ip():
    """Best-guess LAN IPv4 (the address a phone on the same Wi-Fi would use)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))  # no packets sent; just picks the route's source IP
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def _print_startup_qr(port):
    ip = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else _lan_ip()
    url = 'http://%s:%d' % (ip, port)
    if os.name == 'nt':
        # ANSI colours in the classic console, or the QR prints as escape codes
        try:
            import ctypes
            k = ctypes.windll.kernel32
            k.SetConsoleMode(k.GetStdHandle(-11), 7)
        except Exception:
            pass
    try:
        print(qr_terminal(url))
    except Exception:
        pass  # never let the QR stop the server from starting
    print('  Scan the QR (same Wi-Fi) or open  %s\n' % url)


def _die_on_console_close():
    """Exit at once when the console window is closed, so the port is free for the next launch."""
    if os.name != 'nt':
        return
    import ctypes

    @ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_uint)
    def _handler(event):
        if event in (2, 5, 6):  # close, logoff, shutdown
            os._exit(0)
        return 0

    ctypes.windll.kernel32.SetConsoleCtrlHandler(_handler, True)
    _die_on_console_close._handler = _handler  # keep the ctypes callback alive


if __name__ == '__main__':
    _die_on_console_close()
    _print_startup_qr(PORT)
    httpd = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print('Serving %s on http://0.0.0.0:%d' % (ROOT, PORT))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()
