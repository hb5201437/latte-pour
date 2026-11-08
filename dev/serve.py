# 本地预览用的静态服务器：每个响应都带 no-store，浏览器不会拿旧脚本
import http.server, functools, sys

class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = sys.argv[1]
port = int(sys.argv[2])
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoStore, directory=root)).serve_forever()
