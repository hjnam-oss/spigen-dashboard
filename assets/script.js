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
            monthSelector.value = months[0];
            renderDashboard(data, months[0]);
        }

        // 연도 드롭다운 초기화 (데이터에 있는 연도만)
        const allYears = new Set();
        (data.history || []).forEach(h => allYears.add(h.date.slice(0, 4)));
        (data.blog_posts_list || []).forEach(p => allYears.add(p.date.slice(0, 4)));
        (data.youtube_videos_list || []).forEach(v => allYears.add(v.date.slice(0, 4)));
        const sortedYears = [...allYears].sort();

        ['fromYear','toYear'].forEach(id => {
            const sel = document.getElementById(id);
            sortedYears.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = `${y}년`;
                sel.appendChild(opt);
            });
            if (sortedYears.length === 1) sel.value = sortedYears[0];
        });

        // 월/일 드롭다운 초기화
        const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        ['fromMonth','toMonth'].forEach(id => {
            const sel = document.getElementById(id);
            MONTHS.forEach((m, i) => {
                const opt = document.createElement('option');
                opt.value = String(i + 1).padStart(2, '0');
                opt.textContent = m;
                sel.appendChild(opt);
            });
        });

        function getDaysInMonth(month) {
            const days = [31,29,31,30,31,30,31,31,30,31,30,31];
            return month ? days[parseInt(month) - 1] : 31;
        }

        function populateDays(monthSelId, daySelId) {
            const month = document.getElementById(monthSelId).value;
            const daySel = document.getElementById(daySelId);
            const prev = daySel.value;
            daySel.innerHTML = '';
            const max = getDaysInMonth(month);
            for (let d = 1; d <= max; d++) {
                const opt = document.createElement('option');
                opt.value = String(d).padStart(2, '0');
                opt.textContent = `${d}일`;
                daySel.appendChild(opt);
            }
            if (prev && parseInt(prev) <= max) daySel.value = prev;
        }

        populateDays('fromMonth', 'fromDay');
        populateDays('toMonth', 'toDay');
        document.getElementById('fromMonth').addEventListener('change', () => populateDays('fromMonth', 'fromDay'));
        document.getElementById('toMonth').addEventListener('change', () => populateDays('toMonth', 'toDay'));

        // 날짜 범위 적용
        document.getElementById('dateRangeBtn').addEventListener('click', () => {
            const fy = document.getElementById('fromYear').value;
            const fm = document.getElementById('fromMonth').value;
            const fd = document.getElementById('fromDay').value;
            const ty = document.getElementById('toYear').value;
            const tm = document.getElementById('toMonth').value;
            const td = document.getElementById('toDay').value;
            if (!fy || !fm || !fd || !ty || !tm || !td) {
                alert('시작일과 종료일을 모두 선택해주세요.');
                return;
            }
            const from = `${fy}-${fm}-${fd}`;
            const to   = `${ty}-${tm}-${td}`;
            if (from > to) {
                alert('시작일이 종료일보다 늦을 수 없습니다.');
                return;
            }
            monthSelector.value = '';
            renderDashboard(data, null, { from, to });
        });

        // 기간 선택 토글
        const toggleBtn = document.getElementById('dateRangeToggle');
        const picker = document.getElementById('dateRangePicker');

        // 월 변경 시 리렌더링
        monthSelector.addEventListener('change', (e) => {
            ['fromYear','fromMonth','fromDay','toYear','toMonth','toDay'].forEach(id => {
                const el = document.getElementById(id);
                if (id.endsWith('Year') && sortedYears.length === 1) el.value = sortedYears[0];
                else el.value = '';
            });
            picker.classList.remove('open');
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '기간 선택 ▾';
            renderDashboard(data, e.target.value);
        });

        toggleBtn.addEventListener('click', () => {
            const isOpen = picker.classList.toggle('open');
            toggleBtn.classList.toggle('active', isOpen);
            toggleBtn.textContent = isOpen ? '기간 선택 ▴' : '기간 선택 ▾';
        });

        // 날짜 범위 초기화
        document.getElementById('dateRangeReset').addEventListener('click', () => {
            ['fromYear','fromMonth','fromDay','toYear','toMonth','toDay'].forEach(id => {
                const el = document.getElementById(id);
                if (id.endsWith('Year') && sortedYears.length === 1) el.value = sortedYears[0];
                else el.value = '';
            });
            if (months.length > 0) {
                monthSelector.value = months[0];
                renderDashboard(data, months[0]);
            }
            picker.classList.remove('open');
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '기간 선택 ▾';
        });

    } catch (error) {
        console.error('데이터를 불러오는데 실패했습니다:', error);
        document.getElementById('lastUpdated').textContent = '데이터 로드 실패';
    }
});

function renderDashboard(data, selectedMonth, dateRange) {
    // 날짜 필터 함수
    const inRange = (date) => {
        if (dateRange) return date >= dateRange.from && date <= dateRange.to;
        return date.startsWith(selectedMonth);
    };

    const filteredHistory = data.history.filter(item => inRange(item.date));

    // 구독자/조회수 카드 — history 있을 때만
    if (filteredHistory.length > 0) {
        const latest = filteredHistory[filteredHistory.length - 1];

        // 전월 마지막 항목을 previous로 사용 (날짜 범위 모드에서는 범위 시작 직전 항목)
        let previous = latest;
        if (dateRange) {
            const beforeRange = data.history.filter(item => item.date < dateRange.from);
            if (beforeRange.length > 0) previous = beforeRange[beforeRange.length - 1];
        } else {
            const prevMonth = selectedMonth.slice(0, 4) + '-' + String(parseInt(selectedMonth.slice(5, 7)) - 1).padStart(2, '0');
            const prevMonthHistory = data.history.filter(item => item.date.startsWith(prevMonth));
            if (prevMonthHistory.length > 0) previous = prevMonthHistory[prevMonthHistory.length - 1];
        }


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
    const monthPosts = (data.blog_posts_list || []).filter(p => inRange(p.date));
    const periodLabel = dateRange ? `${dateRange.from} ~ ${dateRange.to}` : `${selectedMonth.split('-')[1].replace(/^0/, '')}월 업로드`;

    document.getElementById('blogTotalPosts').textContent = monthPosts.length;
    document.getElementById('blogTotalPostsTrend').textContent = periodLabel;
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
        monthPosts.forEach(post => {
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
    const filteredVideos = (data.youtube_videos_list || []).filter(v => inRange(v.date));

    const ytCountBadge = document.getElementById('ytVideosCount');
    if (ytCountBadge) ytCountBadge.textContent = filteredVideos.length;

    // YouTube 평균 조회수 — 해당 기간 영상 기준으로 계산
    const ytViewsEl = document.getElementById('ytViews');
    const ytViewsTrendEl = document.getElementById('ytViewsTrend');
    if (filteredVideos.length > 0) {
        const totalViews = filteredVideos.reduce((sum, v) => sum + (v.views || 0), 0);
        const avgViews = Math.round(totalViews / filteredVideos.length);
        ytViewsEl.textContent = new Intl.NumberFormat('ko-KR').format(avgViews);
        ytViewsTrendEl.textContent = `총 ${new Intl.NumberFormat('ko-KR').format(totalViews)}회`;
        ytViewsTrendEl.style.color = '#94a3b8';
    } else {
        ytViewsEl.textContent = '-';
        ytViewsTrendEl.textContent = '영상 없음';
        ytViewsTrendEl.style.color = '#94a3b8';
    }
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
                        <div>
                            <div class="video-title">${video.title}</div>
                            <div class="post-meta" style="margin-top:0.4rem;">${video.date}</div>
                        </div>
                        <div class="post-views" style="flex-direction:column; gap:0.3rem; align-items:center; text-align:center;">
                            <span style="white-space:nowrap;">👀 ${new Intl.NumberFormat('ko-KR').format(video.views)}</span>
                            <span style="white-space:nowrap;">👍 ${new Intl.NumberFormat('ko-KR').format(video.likes)}</span>
                        </div>
                    </div>
                </a>
            `;
            ytList.appendChild(div);
        });
    } else {
        ytList.innerHTML = '<div style="color: #94a3b8; padding: 1rem;">해당 월에 업로드된 영상이 없습니다.</div>';
    }

    // LinkedIn 게시물 카드
    const monthLinkedin = (data.linkedin_posts_list || []).filter(p => inRange(p.date));
    document.getElementById('inPosts').textContent = monthLinkedin.length;
    document.getElementById('inPostsTrend').textContent = dateRange ? `${dateRange.from} ~ ${dateRange.to}` : `${selectedMonth.split('-')[1].replace(/^0/, '')}월 게시물`;
    document.getElementById('inPostsTrend').style.color = '#94a3b8';

    // LinkedIn 게시물 목록
    const linkedinList = document.getElementById('linkedinPostList');
    linkedinList.innerHTML = '';
    if (monthLinkedin.length > 0) {
        monthLinkedin.forEach(post => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <a href="${post.url}" target="_blank" class="post-title">${post.content}</a>
                    <span class="post-meta">${post.date}</span>
                </div>
                <div class="post-views">👍 ${post.likes} 🔁 ${post.shares}</div>
            `;
            linkedinList.appendChild(li);
        });
    } else {
        linkedinList.innerHTML = '<li style="color: #94a3b8;">해당 월에 게시물이 없습니다.</li>';
    }
}
