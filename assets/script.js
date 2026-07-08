let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    try {
        const data = metricsData;

        document.getElementById('lastUpdated').textContent = `최근 업데이트: ${data.last_updated}`;

        // 2026년 데이터만 필터링
        data.blog_posts_list = (data.blog_posts_list || []).filter(p => p.date >= '2026');
        data.youtube_videos_list = (data.youtube_videos_list || []).filter(v => v.date >= '2026');

        // 월 목록 추출 (2026년 이후)
        const allMonths = new Set();
        (data.history || []).filter(h => h.date >= '2026').forEach(item => allMonths.add(item.date.substring(0, 7)));
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

        // 추이 패널
        const trendPanel = document.getElementById('trendPanel');
        let trendChart = null;

        function openTrendChart(type, cfg = {}) {
            currentChartType = type;
            currentChartCfg = cfg;
            trendPanel.classList.add('open');
            if (trendChart) { trendChart.destroy(); trendChart = null; }
            trendChart = renderTrendChart(buildChartData(data, type, cfg, getChartRange()));
        }

        // 차트 기간 드롭다운 초기화
        let currentChartType = 'default';
        let currentChartCfg = {};

        const allHistoryMonths = [...new Set(
            (data.history || []).filter(h => h.date >= '2026').map(h => h.date.slice(0, 7))
        )].sort();

        function populateChartMonths() {
            ['chartFromMonth', 'chartToMonth'].forEach(id => {
                const sel = document.getElementById(id);
                sel.innerHTML = '';
                allHistoryMonths.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = `${parseInt(m.split('-')[1])}월`;
                    sel.appendChild(opt);
                });
            });
            document.getElementById('chartFromMonth').value = allHistoryMonths[0];
            document.getElementById('chartToMonth').value = allHistoryMonths[allHistoryMonths.length - 1];
        }
        populateChartMonths();

        function getChartRange() {
            return {
                from: document.getElementById('chartFromMonth').value,
                to: document.getElementById('chartToMonth').value
            };
        }

        ['chartFromMonth', 'chartToMonth'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                const { from, to } = getChartRange();
                if (from > to) return;
                if (trendChart) { trendChart.destroy(); trendChart = null; }
                trendChart = renderTrendChart(buildChartData(data, currentChartType, currentChartCfg, { from, to }));
            });
        });

// 카드 클릭 → 해당 데이터 그래프
        const cardChartMap = {
            'ytSubscribers': { key: 'youtube_subscribers', label: 'YouTube 구독자', color: '#ef4444', title: 'YouTube 구독자 추이' },
            'ytViews':       { key: 'youtube_avg_views',   label: 'YouTube 평균 조회수', color: '#f97316', title: 'YouTube 평균 조회수 추이' },
            'inFollowers':   { key: 'linkedin_followers',  label: 'LinkedIn 팔로워', color: '#3b82f6', title: 'LinkedIn 팔로워 추이' },
        };

        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', () => {
                const valueEl = card.querySelector('.value');
                if (!valueEl) return;
                const id = valueEl.id;

                // 이미 활성화된 카드 다시 클릭 시 닫기
                if (card.classList.contains('active-chart')) {
                    card.classList.remove('active-chart');
                    trendPanel.classList.remove('open');
                    return;
                }

                document.querySelectorAll('.card').forEach(c => c.classList.remove('active-chart'));
                card.classList.add('active-chart');

                if (cardChartMap[id]) {
                    const cfg = cardChartMap[id];
                    document.getElementById('trendChartTitle').textContent = cfg.title;
                    openTrendChart('history', cfg);
                } else if (id === 'blogTotalPosts' || id === 'blogAvgViews') {
                    const isCount = id === 'blogTotalPosts';
                    document.getElementById('trendChartTitle').textContent = isCount ? '월별 블로그 게시글 수' : '월별 블로그 평균 조회수';
                    openTrendChart('blog', { isCount });
                } else if (id === 'inPosts') {
                    document.getElementById('trendChartTitle').textContent = '월별 LinkedIn 게시물 수';
                    openTrendChart('linkedin');
                }
            });
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

function getMonthlyLastHistory(data) {
    const history = (data.history || []).filter(h => h.date >= '2026').sort((a, b) => a.date.localeCompare(b.date));
    const byMonth = {};
    history.forEach(h => {
        const m = h.date.slice(0, 7);
        byMonth[m] = h; // 같은 월이면 뒤에 오는 게 마지막 항목
    });
    return Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([month, h]) => ({ month, ...h }));
}

function monthLabel(m) {
    return `${parseInt(m.split('-')[1])}월`;
}

function buildChartData(data, type, cfg = {}, range = null) {
    function filterMonthly(monthly) {
        if (!range) return monthly;
        return monthly.filter(h => h.month >= range.from && h.month <= range.to);
    }
    function filterByMonth(list) {
        if (!range) return list;
        return list.filter(p => p.date.slice(0, 7) >= range.from && p.date.slice(0, 7) <= range.to);
    }

    if (type === 'default') {
        const monthly = filterMonthly(getMonthlyLastHistory(data));
        return {
            labels: monthly.map(h => monthLabel(h.month)),
            dual: true,
            datasets: [
                { label: 'YouTube 구독자', data: monthly.map(h => h.youtube_subscribers || null), color: '#ef4444', axisId: 'yt', axisLabel: 'YouTube 구독자' },
                { label: 'LinkedIn 팔로워', data: monthly.map(h => h.linkedin_followers || null), color: '#3b82f6', axisId: 'in', axisLabel: 'LinkedIn 팔로워' }
            ]
        };
    }
    if (type === 'history') {
        const monthly = filterMonthly(getMonthlyLastHistory(data));
        return {
            labels: monthly.map(h => monthLabel(h.month)),
            dual: false,
            datasets: [{ label: cfg.label, data: monthly.map(h => h[cfg.key] || null), color: cfg.color }]
        };
    }
    if (type === 'blog') {
        const byMonth = {};
        (data.blog_posts_list || []).forEach(p => {
            const m = p.date.slice(0, 7);
            if (!byMonth[m]) byMonth[m] = { count: 0, views: 0 };
            byMonth[m].count++;
            byMonth[m].views += p.views || 0;
        });
        const months = Object.keys(byMonth).sort().filter(m => !range || (m >= range.from && m <= range.to));
        return {
            labels: months.map(monthLabel),
            dual: false,
            bar: true,
            datasets: [{ label: cfg.isCount ? '게시글 수' : '평균 조회수', data: months.map(m => cfg.isCount ? byMonth[m].count : Math.round(byMonth[m].views / byMonth[m].count)), color: '#10b981' }]
        };
    }
    if (type === 'linkedin') {
        const byMonth = {};
        (data.linkedin_posts_list || []).forEach(p => {
            const m = p.date.slice(0, 7);
            byMonth[m] = (byMonth[m] || 0) + 1;
        });
        const months = Object.keys(byMonth).sort().filter(m => !range || (m >= range.from && m <= range.to));
        return { labels: months.map(monthLabel), dual: false, bar: true, datasets: [{ label: '게시물 수', data: months.map(m => byMonth[m]), color: '#3b82f6' }] };
    }
}

function renderTrendChart(chartData) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const { labels, datasets, dual, bar } = chartData;
    const type = bar ? 'bar' : 'line';

    const chartDatasets = datasets.map((d, i) => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color.replace(')', ', 0.15)').replace('rgb', 'rgba'),
        yAxisID: dual ? d.axisId : 'y',
        tension: 0.3,
        pointRadius: bar ? undefined : 2,
        fill: false,
        spanGaps: true,
    }));

    const scales = {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 12, display: true, padding: 8 }, grid: { color: 'rgba(255,255,255,0.05)' }, display: true }
    };

    if (dual) {
        scales['yt'] = { type: 'linear', position: 'left',  ticks: { color: '#ef4444' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: datasets[0].axisLabel, color: '#ef4444' } };
        scales['in'] = { type: 'linear', position: 'right', ticks: { color: '#3b82f6' }, grid: { drawOnChartArea: false }, title: { display: true, text: datasets[1].axisLabel, color: '#3b82f6' } };
    } else {
        scales['y'] = { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } };
    }

    return new Chart(ctx, {
        type,
        data: { labels, datasets: chartDatasets },
        options: {
            responsive: true,
            layout: { padding: { top: 10, bottom: 10 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#cbd5e1' } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${new Intl.NumberFormat('ko-KR').format(c.parsed.y)}` } }
            },
            scales
        }
    });
}

function renderDashboard(data, selectedMonth, dateRange) {
    // 날짜 필터 함수
    const inRange = (date) => {
        if (dateRange) return date >= dateRange.from && date <= dateRange.to;
        return date.startsWith(selectedMonth);
    };

    const filteredHistory = data.history.filter(item => inRange(item.date));
    let previous = null;

    // 구독자/조회수 카드 — history 있을 때만
    if (filteredHistory.length > 0) {
        const latest = filteredHistory[filteredHistory.length - 1];

        // 전월 마지막 항목을 previous로 사용 (날짜 범위 모드에서는 범위 시작 직전 항목)
        previous = latest;
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
        if (dateRange) {
            ytViewsTrendEl.textContent = `총 ${new Intl.NumberFormat('ko-KR').format(totalViews)}회`;
            ytViewsTrendEl.style.color = '#94a3b8';
        } else {
            // 월 선택 모드: 전월 대비
            const prevAvg = filteredHistory.length > 0 && previous ? (previous.youtube_avg_views || 0) : 0;
            const diff = avgViews - prevAvg;
            if (diff > 0) {
                ytViewsTrendEl.textContent = `↑ ${new Intl.NumberFormat('ko-KR').format(diff)} (전월 대비)`;
                ytViewsTrendEl.style.color = '#10b981';
            } else if (diff < 0) {
                ytViewsTrendEl.textContent = `↓ ${new Intl.NumberFormat('ko-KR').format(Math.abs(diff))} (전월 대비)`;
                ytViewsTrendEl.style.color = '#ef4444';
            } else {
                ytViewsTrendEl.textContent = '- 변동 없음';
                ytViewsTrendEl.style.color = '#94a3b8';
            }
        }
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
