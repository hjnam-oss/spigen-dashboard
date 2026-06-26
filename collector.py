import os
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import pytz

# 설정
from dotenv import load_dotenv
load_dotenv()
YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY')
YOUTUBE_CHANNEL_ID = "UCKBxMS12tw6l-CcxBpLOzNw"  # 슈피겐코리아 채용/문화 채널
BLOG_URL = "https://www.spigenkorea.co.kr/culture/news.php"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "metrics.json")

def get_youtube_channel_data():
    try:
        # 채널 통계 및 업로드 재생목록 조회 (채널 ID 고정)
        channel_id = YOUTUBE_CHANNEL_ID
        stats_url = f"https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&id={channel_id}&key={YOUTUBE_API_KEY}"
        stats_res = requests.get(stats_url).json()
        stats = stats_res['items'][0]['statistics']
        uploads_playlist_id = stats_res['items'][0]['contentDetails']['relatedPlaylists']['uploads']
        
        # 이번 달 1일의 UTC 시간 구하기 (평균 조회수 계산용)
        now_utc = datetime.now(pytz.utc)
        month_start_utc = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # 업로드 재생목록에서 영상 조회 (최대 50개 — 월별 필터 없이 전체 수집)
        playlist_url = f"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={uploads_playlist_id}&maxResults=50&key={YOUTUBE_API_KEY}"
        playlist_res = requests.get(playlist_url).json()

        all_video_ids = []
        month_video_ids = []
        if 'items' in playlist_res:
            for item in playlist_res['items']:
                pub_date_str = item['snippet']['publishedAt']
                pub_date = datetime.strptime(pub_date_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=pytz.utc)
                video_id = item['snippet']['resourceId']['videoId']
                all_video_ids.append(video_id)
                if pub_date >= month_start_utc:
                    month_video_ids.append(video_id)

        # 전체 영상 통계 수집 (월별 대시보드 표시용)
        month_avg_views = 0
        month_videos = []
        if all_video_ids:
            vids_query = ",".join(all_video_ids)
            vids_stats_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id={vids_query}&key={YOUTUBE_API_KEY}"
            vids_stats_res = requests.get(vids_stats_url).json()

            total_month_views = 0
            month_count = 0
            if 'items' in vids_stats_res:
                for v_item in vids_stats_res['items']:
                    view_count = int(v_item['statistics'].get('viewCount', 0))
                    pub_date = datetime.strptime(v_item['snippet']['publishedAt'], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=pytz.utc)
                    video_date = v_item['snippet']['publishedAt'][:10]
                    if not video_date.startswith('2026'):
                        continue  # 2026년 영상만 수집
                    month_videos.append({
                        "id": v_item['id'],
                        "title": v_item['snippet']['title'],
                        "thumbnail": v_item['snippet']['thumbnails']['medium']['url'],
                        "date": video_date,
                        "views": view_count,
                        "likes": int(v_item['statistics'].get('likeCount', 0))
                    })
                    # 이번 달 영상만 평균 조회수 계산에 포함
                    if v_item['id'] in month_video_ids:
                        total_month_views += view_count
                        month_count += 1
                if month_count > 0:
                    month_avg_views = int(total_month_views / month_count)
        
        return {
            "subscribers": int(stats.get('subscriberCount', 0)),
            "views": int(stats.get('viewCount', 0)),
            "videoCount": int(stats.get('videoCount', 0)),
            "month_avg_views": month_avg_views,
            "month_videos": month_videos
        }
    except Exception as e:
        print(f"YouTube 데이터 수집 오류: {e}")
        return None

def get_post_info(post_id, headers):
    """조회수와 대제목 함께 반환"""
    try:
        import re
        from bs4 import BeautifulSoup
        url = f"https://www.spigenkorea.co.kr/culture/news.php?ptype=view&idx={post_id}&code=news"
        response = requests.get(url, headers=headers, timeout=5)

        # 조회수
        views = 0
        match = re.search(r'visibility</span>\s*(\d+)', response.text)
        if match:
            views = int(match.group(1))

        # 대제목 (h3 태그에서 [카테고리] 제거)
        title = ''
        soup = BeautifulSoup(response.text, 'html.parser')
        h3 = soup.find('h3')
        if h3:
            raw = h3.get_text(strip=True)
            title = re.sub(r'^\[.*?\]', '', raw).strip()

        return views, title
    except Exception:
        return 0, ''

AJAX_URL = 'https://www.spigenkorea.co.kr/admin/bbs/ajax_list.php'

def get_blog_data():
    """AJAX만 사용 — 개별 페이지 방문 없음 (조회수 오염 방지)"""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        seen_ids = set()
        posts = []
        page = 1

        while True:
            ajax_res = requests.post(AJAX_URL, data={
                'category': '', 'searchopt': '', 'searchkey': '',
                'code': 'news', 'page': page, 'fullpage_load': 'N'
            }, headers=headers)
            ajax_data = ajax_res.json()
            if ajax_data.get('result') != '000' or not ajax_data.get('items'):
                break
            for item in ajax_data['items']:
                post_id = str(item.get('idx', ''))
                if not post_id or post_id in seen_ids:
                    continue
                seen_ids.add(post_id)
                reg_date = item.get('wdate', '')[:10].replace('.', '-')
                if not reg_date.startswith('2026'):
                    continue
                title = item.get('subject', '').strip()
                catname = item.get('catname', 'Culture')
                views = item.get('count', 0)
                print(f"  블로그 [{post_id}] 조회수: {views} | {title[:30]}...")
                posts.append({
                    "id": post_id,
                    "title": title,
                    "category": catname,
                    "date": reg_date,
                    "views": views
                })
            page += 1

        return {
            "total_posts": len(seen_ids),
            "posts": posts
        }
    except Exception as e:
        print(f"Blog 데이터 수집 오류: {e}")
        return None


def main():
    print("데이터 수집 시작...")
    
    yt_data = get_youtube_channel_data()
    blog_data = get_blog_data()
    
    # 기존 데이터 로드 (data.js 우선, 없으면 metrics.json)
    data = {"history": [], "recent_blog_posts": [], "recent_youtube_videos": []}
    DATA_JS_FILE = os.path.join(BASE_DIR, 'data', 'data.js')
    if os.path.exists(DATA_JS_FILE):
        try:
            with open(DATA_JS_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
            import re as _re
            json_str = _re.sub(r'^const metricsData\s*=\s*', '', content.strip()).rstrip(';').strip()
            data = json.loads(json_str)
        except:
            pass
    elif os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except:
                pass
                
    today = datetime.now(pytz.timezone('Asia/Seoul')).strftime('%Y-%m-%d')
    current_time = datetime.now(pytz.timezone('Asia/Seoul')).strftime('%Y-%m-%d %H:%M:%S KST')
    
    # 이전 데이터 (LinkedIn 팔로워 유지를 위해)
    last_linkedin = 0
    if data['history']:
        last_linkedin = data['history'][-1].get('linkedin_followers', 0)
        
    yt_views = yt_data['views'] if yt_data else 0
    yt_avg_views = yt_data['month_avg_views'] if yt_data else 0

    # 오늘 데이터 생성/업데이트
    today_entry = {
        "date": today,
        "youtube_subscribers": yt_data['subscribers'] if yt_data else 0,
        "youtube_views": yt_views,
        "youtube_avg_views": yt_avg_views,
        "blog_total_posts": blog_data['total_posts'] if blog_data else 0,
        "linkedin_followers": last_linkedin # 수동 입력용으로 이전 값 유지
    }
    
    # 오늘 데이터가 이미 있으면 덮어쓰기, 없으면 추가
    if data['history'] and data['history'][-1]['date'] == today:
        data['history'][-1] = today_entry
    else:
        data['history'].append(today_entry)
        
    # 최대 30일치 데이터만 보관
    if len(data['history']) > 30:
        data['history'] = data['history'][-30:]
        
    if blog_data and blog_data.get('posts'):
        # 블로그 게시물 교체 방식 (삭제된 글 자동 반영)
        data['blog_posts_list'] = sorted(blog_data['posts'], key=lambda x: x['date'], reverse=True)
        
    # 유튜브 영상 목록: 채널에서 새로 가져온 영상으로 교체 (잘못된 채널 영상 방지)
    if yt_data and yt_data.get('month_videos'):
        new_videos = sorted(yt_data['month_videos'], key=lambda x: x['date'], reverse=True)
        data['youtube_videos_list'] = new_videos
    
    data['last_updated'] = current_time
    
    # 디렉토리 생성 및 저장
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    # HTML 로컬 실행을 위한 JS 파일 저장 추가
    with open(os.path.join(BASE_DIR, 'data', 'data.js'), 'w', encoding='utf-8') as f:
        f.write("const metricsData = ")
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write(";\n")
        
    print(f"데이터 수집 완료! ({current_time})")

if __name__ == "__main__":
    main()
