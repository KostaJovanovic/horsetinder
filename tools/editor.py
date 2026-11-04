#!/usr/bin/env python3
"""Content editor for Horse Tinder: edit www/js/content.js (chat lines, vocabulary,
questions, personalities, handmade horses, prompts) in the browser.

Run: editor.bat, or  python tools/editor.py [port] [--no-browser]   (defaults to 46774)

Localhost only - nobody else on the Wi-Fi can open it or save. Every save first
copies the old file into tools/.backups/ (the last 30 are kept), then runs the
chat and art tests and shows the result, so a broken edit is caught straight away.
"""
import json
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = int(ARGS[0]) if ARGS else 46774
OPEN_BROWSER = '--no-browser' not in sys.argv
TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
WWW = os.path.join(REPO, 'www')
CONTENT = os.path.join(WWW, 'js', 'content.js')
BACKUPS = os.path.join(TOOLS, '.backups')
EDITOR_DIR = os.path.join(TOOLS, 'editor')
PREFIX = 'window.HorseContent = '
KEEP_BACKUPS = 30


def read_content():
    with open(CONTENT, encoding='utf-8') as f:
        text = f.read()
    start, end = text.index('{'), text.rindex('}')
    return json.loads(text[start:end + 1])


def check(new, old):
    """Problems that would break the app. The editor can't add or remove top-level
    sections, and a value can't change type (a list stays a list)."""
    problems = []
    if not isinstance(new, dict):
        return ['The content must be an object.']

    def same_shape(a, b, path, depth):
        if type(a) is not type(b) and not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
            problems.append('%s changed from %s to %s' % (path, type(b).__name__, type(a).__name__))
        elif isinstance(a, dict) and depth < 2:
            for k in b:
                if k not in a:
                    problems.append('%s.%s is missing' % (path, k))
                elif k in a:
                    same_shape(a[k], b[k], path + '.' + k, depth + 1)

    same_shape(new, old, 'content', 0)
    if problems:
        return problems

    def unique(items, what):
        seen = set()
        for it in items:
            i = it.get('id') if isinstance(it, dict) else None
            if not i:
                problems.append('A %s has no id.' % what)
            elif i in seen:
                problems.append('Two %ss share the id "%s".' % (what, i))
            seen.add(i)

    unique(new['horses'], 'horse')
    unique(new['chat']['concepts'], 'chat word group')
    unique(new['chat']['questions'], 'question')
    for key, pool in new['chat']['lines'].items():
        if not isinstance(pool, list):
            problems.append('Line "%s" must be a list.' % key)
    for name in ('interests', 'foods', 'disciplines', 'names', 'bios'):
        if not new[name]:
            problems.append('"%s" can\'t be empty.' % name)
    return problems


def run_tests():
    out = []
    ok = True
    for test in ('test-chat.js', 'test-art.js'):
        try:
            r = subprocess.run(['node', os.path.join(TOOLS, test)], cwd=REPO, capture_output=True,
                               text=True, encoding='utf-8', errors='replace', timeout=120)
            ok = ok and r.returncode == 0
            out.append((r.stdout + r.stderr).strip())
        except FileNotFoundError:
            return None, 'Node is not installed, so the tests were skipped.'
        except subprocess.TimeoutExpired:
            ok = False
            out.append('%s took too long and was stopped.' % test)
    return ok, '\n'.join(out)


def write_content(data):
    os.makedirs(BACKUPS, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    shutil.copy2(CONTENT, os.path.join(BACKUPS, 'content-%s.js' % stamp))
    old = sorted(f for f in os.listdir(BACKUPS) if f.startswith('content-'))
    for f in old[:-KEEP_BACKUPS]:
        os.remove(os.path.join(BACKUPS, f))
    body = PREFIX + json.dumps(data, ensure_ascii=False, indent=2) + ';\n'
    tmp = CONTENT + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(body)
    os.replace(tmp, CONTENT)  # all or nothing: a crash mid-write never leaves half a file
    return stamp


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=EDITOR_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def translate_path(self, path):
        # /www/... is the app itself, so the editor can draw horses with the real art code
        clean = path.split('?', 1)[0].split('#', 1)[0]
        if clean.startswith('/www/'):
            rel = os.path.normpath(clean[len('/www/'):]).lstrip('\\/')
            full = os.path.join(WWW, rel)
            return full if os.path.abspath(full).startswith(WWW) else os.path.join(WWW, '404')
        return super().translate_path(path)

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/content':
            try:
                return self.send_json(200, read_content())
            except (OSError, ValueError) as e:
                return self.send_json(500, {'error': 'Could not read content.js: %s' % e})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/content':
            return self.send_json(404, {'error': 'Not found'})
        # Only this page may save: a web page elsewhere can't set this header without
        # a CORS preflight, which this server never answers.
        origin = self.headers.get('Origin', '')
        if self.headers.get('X-Horse-Editor') != '1' or (origin and origin != 'http://localhost:%d' % PORT
                                                          and origin != 'http://127.0.0.1:%d' % PORT):
            return self.send_json(403, {'error': 'Forbidden'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 20 * 1024 * 1024:
                return self.send_json(413, {'error': 'Too big'})
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError) as e:
            return self.send_json(400, {'error': 'Not valid JSON: %s' % e})
        try:
            problems = check(data, read_content())
        except (KeyError, TypeError, AttributeError) as e:
            problems = ['Something the app needs is missing: %s' % e]
        if problems:
            return self.send_json(400, {'error': 'Not saved.', 'problems': problems})
        try:
            stamp = write_content(data)
        except OSError as e:
            return self.send_json(500, {'error': 'Could not write content.js: %s' % e})
        ok, output = run_tests()
        return self.send_json(200, {'saved': True, 'backup': 'tools/.backups/content-%s.js' % stamp,
                                    'testsOk': ok, 'tests': output})

    def log_message(self, fmt, *args):
        # Saves and errors only; every page and script load would drown them out
        if args and ('/api/' in str(args[0]) or str(args[0]).isdigit()):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    httpd = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    url = 'http://localhost:%d' % PORT
    print('Horse Tinder content editor: %s  (Ctrl+C to stop)' % url)
    print('Editing %s' % CONTENT)
    if OPEN_BROWSER:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()
