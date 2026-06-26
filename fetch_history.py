import os
import json
import re
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/yt-analytics.readonly']
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_SECRETS = os.path.join(BASE_DIR, 'client_secrets.json.json')
TOKEN_FILE = os.path.join(BASE_DIR, 'token.json')
DATA_JS = os.path.join(BASE_DIR, 'data', 'data.js')

def get_analytics_service():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    credentials = None
    if os.path.exists(TOKEN_FILE):
        credentials = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS, SCOPES)
            credentials = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as f:
            f.write(credentials.to_json())

    return build('youtubeAnalytics', 'v2', credentials=credentials)

def fetch_monthly_subscribers(service):
    response = service.reports().query(
        ids='channel==MINE',
        startDate='2026-01-01',
        endDate='2026-06-25',
        metrics='subscribersGained,subscribersLost,views',
        dimensions='day',
        sort='day'
    ).execute()

    rows = response.get('rows', [])
    # 일별 데이터를 월별로 집계
    monthly_map = {}
    for row in rows:
        month = row[0][:7]  # '2026-01-15' → '2026-01'
        if month not in monthly_map:
            monthly_map[month] = {'month': month, 'gained': 0, 'lost': 0, 'views': 0}
        monthly_map[month]['gained'] += int(row[1])
        monthly_map[month]['lost'] += int(row[2])
        monthly_map[month]['views'] += int(row[3])
    return sorted(monthly_map.values(), key=lambda x: x['month'])

def main():
    print("YouTube OAuth 인증 중... 브라우저가 열립니다.")
    service = get_analytics_service()
    print("인증 완료. 구독자 데이터 가져오는 중...")

    monthly = fetch_monthly_subscribers(service)
    print(f"월별 데이터 {len(monthly)}개 수신:")
    for m in monthly:
        print(f"  {m['month']}: +{m['gained']} -{m['lost']} (조회수: {m['views']})")

    # data.js 읽기
    with open(DATA_JS, 'r', encoding='utf-8') as f:
        content = f.read()

    # JSON 파싱
    json_str = re.sub(r'^const metricsData\s*=\s*', '', content.strip()).rstrip(';').strip()
    data = json.loads(json_str)

    # 누적 구독자 수 계산 (가장 최근 실제값 기준으로 역산)
    # 현재 data.js의 최신 구독자 수를 기준으로 월별 누적 계산
    history_by_date = {h['date']: h for h in data['history']}

    # Analytics는 monthly gained/lost만 주므로, 현재 구독자수에서 역산
    # 최신 구독자 수 = 가장 마지막 history 값 사용
    latest_subs = data['history'][-1]['youtube_subscribers']
    print(f"\n현재 구독자 수(기준): {latest_subs}")

    # 6월까지의 gained/lost 합산해서 역산
    # monthly는 1월~6월 순서
    # 6월 말 구독자 = latest_subs (현재 6월 25일 기준이므로 6월 전체 아님)
    # 대신 각 월말 구독자를 history에서 찾거나 없으면 Analytics 데이터로 채움

    # 각 월말 구독자 수 역산
    # 핵심: running에서 해당 월 증감을 빼면 전월 말 값이 나옴
    # 그러므로 역산 전에 먼저 이번 달(6월) 증감을 제거해야 5월 말이 정확히 나옴
    monthly_end_subs = {}
    running = latest_subs
    for m in reversed(monthly):
        # running은 이 월이 끝난 후의 구독자 수 → 이 월의 말일 값
        monthly_end_subs[m['month']] = running - 1
        # 이 월의 증감을 역산해서 전월 말 값으로 이동
        running = running - m['gained'] + m['lost']

    print("\n월말 구독자 추정:")
    for month, subs in sorted(monthly_end_subs.items()):
        print(f"  {month}: {subs}명")

    # history 업데이트: 해당 월의 마지막날 항목에 반영
    month_to_lastday = {
        '2026-01': '2026-01-31',
        '2026-02': '2026-02-28',
        '2026-03': '2026-03-31',
        '2026-04': '2026-04-30',
        '2026-05': '2026-05-31',
        '2026-06': '2026-06-25',
    }

    # 월별 총 조회수 (Analytics API)
    monthly_total_views = {m['month']: m['views'] for m in monthly}

    # 월별 평균 조회수: 해당 월 업로드 영상들의 현재 조회수 평균 (youtube_videos_list 기반)
    monthly_avg_views = {}
    monthly_videos_by_month = {}
    for v in data.get('youtube_videos_list', []):
        month = v.get('date', '')[:7]
        if month and month.startswith('2026'):
            monthly_videos_by_month.setdefault(month, []).append(v.get('views', 0))

    for month, views_list in monthly_videos_by_month.items():
        monthly_avg_views[month] = round(sum(views_list) / len(views_list)) if views_list else 0

    print("\n월별 평균 조회수 (업로드 영상 기준):")
    for month, avg in sorted(monthly_avg_views.items()):
        print(f"  {month}: 평균 {avg:,}회 (영상 {len(monthly_videos_by_month[month])}개)")

    # 현재 LinkedIn 팔로워 수 (가장 최근 history에서 가져오기)
    current_linkedin = 0
    for h in sorted(data['history'], key=lambda x: x['date'], reverse=True):
        if h.get('linkedin_followers', 0) > 0:
            current_linkedin = h['linkedin_followers']
            break

    history_map = {h['date']: h for h in data['history']}
    for month, subs in monthly_end_subs.items():
        last_day = month_to_lastday.get(month)
        if not last_day:
            continue
        avg_views = monthly_avg_views.get(month, 0)
        total_views = monthly_total_views.get(month, 0)
        if last_day in history_map:
            history_map[last_day]['youtube_subscribers'] = subs
            history_map[last_day]['youtube_views'] = total_views
            history_map[last_day]['youtube_avg_views'] = avg_views
            if history_map[last_day].get('linkedin_followers', 0) == 0:
                history_map[last_day]['linkedin_followers'] = current_linkedin
            print(f"  업데이트: {last_day} → 구독자 {subs}, 평균조회수 {avg_views:,}")
        else:
            history_map[last_day] = {
                "date": last_day,
                "youtube_subscribers": subs,
                "youtube_views": total_views,
                "youtube_avg_views": avg_views,
                "blog_total_posts": 0,
                "linkedin_followers": current_linkedin
            }
            print(f"  생성: {last_day} → 구독자 {subs}, 평균조회수 {avg_views:,}, LinkedIn {current_linkedin}")

    data['history'] = sorted(history_map.values(), key=lambda x: x['date'])

    # data.js 저장
    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write('const metricsData = ')
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write(';\n')

    print(f"\n완료! {DATA_JS} 업데이트됨.")

if __name__ == '__main__':
    main()
