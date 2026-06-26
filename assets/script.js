let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    try {
        const data = metricsData;

        document.getElementById('lastUpdated').textContent = `최근 업데이트: ${data.last_updated}`;

        // 2026년 데이터만 필터링
        data.blog_posts_list = (data.blog_posts_list || []).filter(p => p.date.startsWith('2026'));
        data.youtube_videos_list = (data.youtube_videos_list || []).filter(v => v.date.startsWith('2026'));

        // 월 목록 추출 (2026년만)
        const allMonths = new Set();
        (data.history || []).filter(h => h.date.startsWith('2026')).forEach(item => allMonths.add(item.date.substring(0, 7)));
        (data.blog_posts_list || []).forEach(p => allMonths.add(p.date.substring(0, 7)));
        (data.youtube_videos_list || []).forEach(v => allMonths.add(v.date.substring(0, 7)));
        const months = [...allMonths].sort().reverse();

        
        const monthSelector = document.getElementById('monthSelector');
        months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            const [year, m] = month.split('-');
            option.textContent = `${year}년 ${parseInt(m)}월`;
            monthSelector.appendChild(option);
        });

        // 초기 렌더링 (가장 최근 월)
        if (months.length > 0) {
            renderDashboard(data, months[0]);
        }

        // 월 변경 시 리렌더링
        monthSelector.addEventListener('change', (e) => {
            renderDashboard(data, e.target.value);
        });

    } catch (error) {
        console.error('데이터를 불러오는데 실패했습니다:', error);
        document.getElementById('lastUpdated').textContent = '데이터 로드 실패';
    }
});

function renderDashboard(data, selectedMonth) {
    const filteredHistory = data.history.filter(item => item.date.startsWith(selectedMonth));

    // 구독자/조회수 카드 — history 있을 때만
    if (filteredHistory.length > 0) {
        const latest = filteredHistory[filteredHistory.length - 1];

        // 전월 마지막 항목을 previous로 사용
        const prevMonth = selectedMonth.slice(0, 4) + '-' + String(parseInt(selectedMonth.slice(5, 7)) - 1).padStart(2, '0');
        const prevMonthHistory = data.history.filter(item => item.date.startsWith(prevMonth));
        const previous = prevMonthHistory.length > 0
            ? prevMonthHistory[prevMonthHistory.length - 1]
            : latest;


        const updateCard = (id, value) => {
            const el = document.getElementById(id);
            const trendEl = document.getElementById(`${id}Trend`);
            if (latest[value] === undefined) return;
            el.textContent = new Intl.NumberFormat('ko-KR').format(latest[value]);
            const diff = latest[value] - (previous[value] || 0);
            if (diff > 0) {
                trendEl.textContent = `↑ ${new Intl.NumberFormat('ko-KR').format(diff)} (전월 대비)`;
                trendEl.style.color = '#10b981';
            } else if (diff < 0) {
                trendEl.textContent = `↓ ${new Intl.NumberFormat('ko-KR').format(Math.abs(diff))} (전월 대비)`;
                trendEl.style.color = '#ef4444';
            } else {
                trendEl.textContent = '- 변동 없음';
                trendEl.style.color = '#94a3b8';
            }
        };

        updateCard('ytSubscribers', 'youtube_subscribers');
        updateCard('ytViews', 'youtube_avg_views');
        updateCard('inFollowers', 'linkedin_followers');
    } else {
        // 히스토리 없는 달은 카드 초기화
        ['ytSubscribers', 'ytViews'].forEach(id => {
            document.getElementById(id).textContent = '-';
            document.getElementById(`${id}Trend`).textContent = '데이터 없음';
            document.getElementById(`${id}Trend`).style.color = '#94a3b8';
        });
    }

    // 블로그 카드 — 항상 렌더링
    const monthPosts = (data.blog_posts_list || []).filter(p => p.date.startsWith(selectedMonth));

    document.getElementById('blogTotalPosts').textContent = monthPosts.length;
    document.getElementById('blogTotalPostsTrend').textContent = `${selectedMonth.split('-')[1].replace(/^0/, '')}월 업로드`;
    document.getElementById('blogTotalPostsTrend').style.color = '#94a3b8';

    const blogAvgEl = document.getElementById('blogAvgViews');
    const blogAvgTrendEl = document.getElementById('blogAvgViewsTrend');
    if (monthPosts.length > 0) {
        const totalViews = monthPosts.reduce((sum, p) => sum + (p.views || 0), 0);
        blogAvgEl.textContent = new Intl.NumberFormat('ko-KR').format(Math.round(totalViews / monthPosts.length));
        blogAvgTrendEl.textContent = `총 ${new Intl.NumberFormat('ko-KR').format(totalViews)}회`;
        blogAvgTrendEl.style.color = '#94a3b8';
    } else {
        blogAvgEl.textContent = '-';
        blogAvgTrendEl.textContent = '게시글 없음';
        blogAvgTrendEl.style.color = '#94a3b8';
    }

    // 블로그 게시물 목록 — 항상 렌더링
    const blogList = document.getElementById('blogPostList');
    blogList.innerHTML = '';
    if (monthPosts.length > 0) {
        monthPosts.slice(0, 10).forEach(post => {
            const li = document.createElement('li');
            const postUrl = post.id
                ? `https://www.spigenkorea.co.kr/culture/news.php?ptype=view&idx=${post.id}&code=news`
                : '#';
            li.innerHTML = `
                <div>
                    <a href="${postUrl}" target="_blank" class="post-title">${post.title}</a>
                    <span class="post-meta">${post.category} | ${post.date}</span>
                </div>
                <div class="post-views">👁 ${post.views}</div>
            `;
            blogList.appendChild(li);
        });
    } else {
        blogList.innerHTML = '<li style="color: #94a3b8;">해당 월에 게시된 글이 없습니다.</li>';
    }

    // 유튜브 영상 목록 — 항상 렌더링
    const ytList = document.getElementById('youtubeVideoList');
    const filteredVideos = (data.youtube_videos_list || []).filter(v => v.date.startsWith(selectedMonth));
    ytList.innerHTML = '';
    if (filteredVideos.length > 0) {
        filteredVideos.forEach(video => {
            const div = document.createElement('div');
            div.className = 'video-card';
            const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
            div.innerHTML = `
                <a href="${videoUrl}" target="_blank" style="text-decoration:none;color:inherit;">
                    <img src="${video.thumbnail}" alt="thumbnail" class="video-thumb" onerror="this.style.display='none'">
                    <div class="video-info">
                        <div class="video-title">${video.title}</div>
                        <div class="video-stats">
                            <span>👀 ${new Intl.NumberFormat('ko-KR').format(video.views)}</span>
                            <span>👍 ${new Intl.NumberFormat('ko-KR').format(video.likes)}</span>
                        </div>
                    </div>
                </a>
            `;
            ytList.appendChild(div);
        });
    } else {
        ytList.innerHTML = '<div style="color: #94a3b8; padding: 1rem;">해당 월에 업로드된 영상이 없습니다.</div>';
    }

    // LinkedIn 게시물 목록
    const linkedinList = document.getElementById('linkedinPostList');
    const filteredLinkedin = (data.linkedin_posts_list || []).filter(p => p.date.startsWith(selectedMonth));
    linkedinList.innerHTML = '';
    if (filteredLinkedin.length > 0) {
        filteredLinkedin.forEach(post => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <a href="${post.url}" target="_blank" class="post-title">${post.content}</a>
                    <span class="post-meta">${post.date}</span>
                </div>
                <div class="post-views">👍 ${post.likes} &nbsp; 🔁 ${post.shares}</div>
            `;
            linkedinList.appendChild(li);
        });
    } else {
        linkedinList.innerHTML = '<li style="color: #94a3b8;">해당 월에 게시물이 없습니다.</li>';
    }
}
