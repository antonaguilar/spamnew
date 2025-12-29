from flask import Flask, request, jsonify, render_template
import requests
import concurrent.futures
from requests.exceptions import RequestException
import os
import re

app = Flask(__name__, static_folder='static', static_url_path='/static')

# Resource limits
MAX_WORKERS = 10
REQUEST_TIMEOUT = 8

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/api/convert-cookie', methods=['POST'])
def convert_cookie():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400

        cookie = data.get('cookie')
        if not cookie:
            return jsonify({"error": "Missing cookie"}), 400

        print(f"[LOG] Converting cookie: {cookie[:30]}...")

        header_ = {
            'authority': 'business.facebook.com',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'max-age=0',
            'cookie': cookie,
            'referer': 'https://www.facebook.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
        
        try:
            response = requests.get(
                'https://business.facebook.com/content_management',
                headers=header_,
                timeout=REQUEST_TIMEOUT
            )
            print(f"[LOG] Response status: {response.status_code}")
            
            if response.status_code != 200:
                return jsonify({"error": "Cookie invalid or expired"}), 400
            
            token_match = re.search(r'"(EAAG[a-zA-Z0-9_\-]+)"', response.text)
            if not token_match:
                token_match = re.search(r'EAAG[a-zA-Z0-9_\-]+', response.text)
            
            if token_match:
                token = token_match.group(1) if token_match.lastindex else token_match.group(0)
                print(f"[LOG] Token found: {token[:20]}...")
                return jsonify({"token": token}), 200
            
            print("[LOG] No token found in response")
            return jsonify({"error": "Could not extract token"}), 400
            
        except requests.Timeout:
            print("[LOG] Request timeout")
            return jsonify({"error": "Request timeout - server took too long"}), 504
        except RequestException as e:
            print(f"[LOG] Request error: {str(e)}")
            return jsonify({"error": "Connection failed"}), 500

    except Exception as e:
        print(f"[LOG] Exception: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/share', methods=['POST'])
def share_post():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400

        link = data.get('link')
        cookie = data.get('cookie')
        token = data.get('token')
        count = int(data.get('count', 1))
        mode = data.get('mode', 'fast')
        max_workers = int(data.get('maxWorkers', MAX_WORKERS))

        print(f"[LOG] Share request: link={link}, count={count}, mode={mode}")

        if not link or not cookie or not token:
            return jsonify({"error": "Missing required fields"}), 400

        if count < 1:
            return jsonify({"error": "Count must be at least 1"}), 400

        max_workers = min(max_workers, MAX_WORKERS)
        share_delay = float(data.get('shareDelay', 0.5))

        # Only store summary, not full results to save memory
        failed_count = 0
        success_count = 0
        
        def _post_once(session, index):
            nonlocal failed_count, success_count
            try:
                headers = {
                    'accept': '*/*',
                    'accept-encoding': 'gzip, deflate',
                    'connection': 'keep-alive',
                    'content-length': '0',
                    'cookie': cookie,
                    'host': 'graph.facebook.com',
                    'user-agent': 'Mozilla/5.0'
                }
                r = session.post(
                    f"https://graph.facebook.com/me/feed?link={link}&published=0&access_token={token}",
                    headers=headers,
                    timeout=REQUEST_TIMEOUT
                )
                
                if 'error' in r.text or r.status_code >= 400:
                    failed_count += 1
                    return False
                else:
                    success_count += 1
                    return True
                
            except requests.Timeout:
                failed_count += 1
                return False
            except Exception as e:
                print(f"[LOG] Post error: {str(e)}")
                failed_count += 1
                return False

        if mode == 'slow':
            import time
            with requests.Session() as session:
                for i in range(count):
                    _post_once(session, i)
                    
                    if failed_count > count // 2:
                        print(f"[LOG] Stopping: Too many failures")
                        break
                    
                    if i < count - 1:
                        time.sleep(share_delay)
        else:
            with requests.Session() as session:
                with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
                    futures = [ex.submit(_post_once, session, i) for i in range(count)]
                    for fut in concurrent.futures.as_completed(futures):
                        try:
                            fut.result(timeout=REQUEST_TIMEOUT + 5)
                        except Exception as e:
                            failed_count += 1

        print(f"[LOG] Completed: {success_count} success, {failed_count} failed")
        return jsonify({
            "success_count": success_count,
            "failed_count": failed_count,
            "message": f"Completed: {success_count} successful, {failed_count} failed",
            "mode": mode
        }), 200

    except Exception as e:
        print(f"[LOG] Share error: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), threaded=True)

