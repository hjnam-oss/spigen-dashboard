import os
import json
import re
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_SECRETS = os.path.join(BASE_DIR, 'client_secrets.json.json')
TOKEN_FILE = os.path.join(BASE_DIR, 'token_sheets.json')  # Sheets 전용 토큰
DATA_JS = os.path.join(BASE_DIR, 'data', 'data.js')

from config import SPREADSHEET_ID
SHEET_NAME = '26년 홍보 컨텐츠_블로그'
DATA_START_ROW = 9  # 8행이 헤더, 9행부터 데이터


def get_sheets_service():
    credentials = None
    if os.path.exists(TOKEN_FILE):
        credentials = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            try:
                credentials.refresh(Request())
            except Exception:
                credentials = None

        if not credentials or not credentials.valid:
            print("Google 인증이 필요합니다. 브라우저가 열립니다...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS, SCOPES)
            credentials = flow.run_local_server(port=0)
            with open(TOKEN_FILE, 'w') as f:
                f.write(credentials.to_json())

    return build('sheets', 'v4', credentials=credentials)


def load_data_js():
    with open(DATA_JS, 'r', encoding='utf-8') as f:
        content = f.read()
    json_str = re.sub(r'^const metricsData\s*=\s*', '', content.strip()).rstrip(';').strip()
    return json.loads(json_str)


def get_existing_data(service):
    """시트에서 기존 데이터 전체 읽기"""
    range_name = f"'{SHEET_NAME}'!B{DATA_START_ROW}:F"
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=range_name
    ).execute()
    rows = result.get('values', [])
    existing = []
    for row in rows:
        title = row[1].strip() if len(row) > 1 else ''
        date = row[2].strip() if len(row) > 2 else ''
        channel = row[3].strip() if len(row) > 3 else ''
        if title:
            existing.append({'title': title, 'date': date, 'channel': channel})
    return existing


def get_last_row(service):
    """데이터가 있는 마지막 행 번호"""
    range_name = f"'{SHEET_NAME}'!B{DATA_START_ROW}:B"
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=range_name
    ).execute()
    rows = result.get('values', [])
    return DATA_START_ROW + len(rows) - 1


def append_rows(service, rows):
    """새 행 추가"""
    range_name = f"'{SHEET_NAME}'!B:G"
    body = {'values': rows}
    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=range_name,
        valueInputOption='USER_ENTERED',
        insertDataOption='INSERT_ROWS',
        body=body
    ).execute()


def main():
    print("Google Sheets 동기화 시작...")

    service = get_sheets_service()
    data = load_data_js()

    existing = get_existing_data(service)
    print(f"시트 기존 항목: {len(existing)}개")

    def normalize(title):
        """특수문자·공백·이모지 제거, x/X/× 통일 후 한글+영문+숫자만 남김"""
        import unicodedata
        # × → x 통일
        title = title.replace('×', 'x').replace('X', 'x')
        result = ''
        for ch in title:
            cat = unicodedata.category(ch)
            if cat.startswith('L') or cat.startswith('N'):
                result += ch.lower()  # 대소문자 통일
        return result

    existing_keys = {}  # (channel, norm_title) → norm_title 길이
    for e in existing:
        norm = normalize(e['title'])
        key = (e['channel'], norm)
        existing_keys[key] = norm

    def is_duplicate(title, date, channel):
        norm = normalize(title)
        # 정확 매칭
        if (channel, norm) in existing_keys:
            return True
        # 앞부분 매칭: 시트 제목이 더 짧을 수 있으므로 겹치는 앞부분만 비교
        for (ch, ex_norm) in existing_keys:
            if ch != channel:
                continue
            min_len = min(len(norm), len(ex_norm))
            if min_len >= 8 and norm[:min_len] == ex_norm[:min_len]:
                return True
        return False

    new_rows = []

    # 유튜브 영상 (2026년만)
    for video in data.get('youtube_videos_list', []):
        if not video.get('date', '').startswith('2026'):
            continue
        title = video.get('title', '').strip()
        date = video.get('date', '')
        if is_duplicate(title, date, '유튜브'):
            print(f"  [중복 건너뜀] {title[:40]} ({date})")
            continue
        month = int(date.split('-')[1]) if date else 0
        new_rows.append({'date': date, 'row': [month, title, date, '유튜브', '']})

    # 블로그 게시글 (2026년만)
    for post in data.get('blog_posts_list', []):
        if not post.get('date', '').startswith('2026'):
            continue
        title = post.get('title', '').strip()
        date = post.get('date', '')
        if is_duplicate(title, date, '블로그'):
            print(f"  [중복 건너뜀] {title[:40]} ({date})")
            continue
        month = int(date.split('-')[1]) if date else 0
        new_rows.append({'date': date, 'row': [month, title, date, '블로그', post.get('category', '')]})

    if not new_rows:
        print("\n추가할 새 항목이 없습니다.")
        return

    new_rows.sort(key=lambda x: x['date'])

    print(f"\n새로 추가할 항목: {len(new_rows)}개")
    for item in new_rows:
        print(f"  [{item['row'][3]}] {item['row'][1][:40]} ({item['row'][2]})")

    confirm = input("\n시트에 추가하시겠습니까? (y/n): ").strip().lower()
    if confirm != 'y':
        print("취소되었습니다.")
        return

    append_rows(service, [item['row'] for item in new_rows])
    print(f"완료! {len(new_rows)}개 항목이 추가되었습니다.")


if __name__ == '__main__':
    main()
