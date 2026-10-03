"""Простой threaded-сервер для локальных тестов (http.server однопоточный и виснет).
Запуск: python tools/serve.py [порт]"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8850


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


if __name__ == '__main__':
    handler = functools.partial(Handler, directory=ROOT)
    print('serving %s on http://127.0.0.1:%d' % (ROOT, PORT))
    ThreadingHTTPServer(('127.0.0.1', PORT), handler).serve_forever()