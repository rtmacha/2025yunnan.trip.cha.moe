async function loadData() {
  const res = await fetch('./data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('无法加载 data.json');
  return await res.json();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}

function renderKV(target, overview) {
  target.innerHTML = '';
  Object.entries(overview).forEach(([k, v]) => {
    target.appendChild(el('div', { class: 'row' }, [
      el('span', {}, k),
      el('span', {}, v)
    ]));
  });
}

function renderNotes(target, notes) {
  target.innerHTML = '';
  notes.forEach(n => {
    const badge = n.badge
      ? el('span', { class: `badge ${n.badge.type || ''}` }, n.badge.text || '')
      : null;

    const title = el('div', { class: 'title' }, [
      badge,
      el('span', {}, n.title || '')
    ]);

    const body = el('ul', {}, (n.content || []).map(line => el('li', {}, line)));

    target.appendChild(el('div', { class: 'note' }, [title, body]));
  });
}

function renderTimeline(target, itinerary) {
  target.innerHTML = '';
  itinerary.forEach(day => {
    const head = el('div', { class: 'day-head' }, [
      el('div', { class: 'left' }, [
        el('span', { class: 'date' }, day.date || ''),
        el('span', { class: 'route' }, day.route || '')
      ])
    ]);

    const body = el('div', { class: 'day-body' }, (day.items || []).map(item => {
      const infoBlock = el('div', { class: 'item-info' }, [
        el('div', {}, [
          el('div', { class: 'time' }, item.time || ''),
          el('div', { class: 'label' }, item.title || '')
        ])
      ]);
      const transportIcon = createTransportIcon(item);
      if (transportIcon) infoBlock.insertBefore(transportIcon, infoBlock.firstChild);

      const top = el('div', { class: 'item-top' }, [infoBlock]);

      const desc = el('div', { class: 'desc' }, item.desc || '');
      const meta = el('div', { class: 'meta' }, (item.tags || []).map(createTagChip));

      return el('div', { class: 'item' }, [top, desc, meta]);
    }));

    target.appendChild(el('article', { class: 'day' }, [head, body]));
  });
}

function renderChips(target, itinerary, onFilter) {
  target.innerHTML = '';
  const allChip = el('button', { class: 'chip active', type: 'button' }, '全部');
  target.appendChild(allChip);

  itinerary.forEach((day, idx) => {
    const chip = el('button', { class: 'chip', type: 'button' }, day.date);
    chip.addEventListener('click', () => {
      [...target.querySelectorAll('.chip')].forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      onFilter(idx);
    });
    target.appendChild(chip);
  });

  allChip.addEventListener('click', () => {
    [...target.querySelectorAll('.chip')].forEach(x => x.classList.remove('active'));
    allChip.classList.add('active');
    onFilter(null);
  });
}

let shareTriggerButton = null;
let wechatModalEl = null;
let wechatQRImgEl = null;

function setupActions(data) {
  const btnPrint = document.getElementById('btnPrint');
  btnPrint?.addEventListener('click', () => window.print());

  shareTriggerButton = document.getElementById('btnShare');
  const shareMenu = document.getElementById('shareMenu');
  if (shareTriggerButton && !shareTriggerButton.dataset.defaultText) {
    shareTriggerButton.dataset.defaultText = shareTriggerButton.textContent;
  }
  const sharePayload = {
    title: data.site?.title || document.title || '行程分享',
    text: data.site?.subtitle || '云南行程分享',
    url: window.location.href
  };

  if (shareTriggerButton && shareMenu) {
    shareTriggerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      shareMenu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!shareMenu.contains(e.target) && e.target !== shareTriggerButton) {
        shareMenu.classList.remove('open');
      }
    });
    shareMenu.querySelectorAll('button[data-share]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await handleShareAction(btn.dataset.share, sharePayload);
        shareMenu.classList.remove('open');
      });
    });
  }

  wechatModalEl = document.getElementById('wechatModal');
  wechatQRImgEl = document.getElementById('wechatQRImage');
  const btnCloseWechat = document.getElementById('btnCloseWechat');
  const hideWechat = () => wechatModalEl?.classList.remove('show');
  btnCloseWechat?.addEventListener('click', hideWechat);
  wechatModalEl?.addEventListener('click', (e) => {
    if (e.target === wechatModalEl) hideWechat();
  });
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function handleShareAction(target, shareData = {}) {
  const url = shareData.url || window.location.href;
  const payload = {
    title: shareData.title || document.title || '行程分享',
    text: shareData.text || '',
    url
  };

  const canUseNativeShare = typeof navigator !== 'undefined' && navigator.share && isMobileDevice();

  if (target !== 'copy' && canUseNativeShare) {
    try {
      await navigator.share(payload);
      return;
    } catch (err) {
      console.warn('Native share cancelled', err);
    }
  }

  if (target === 'wechat') {
    showWechatModal(url);
    return;
  }

  if (target === 'qq') {
    const qqUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(payload.title)}&desc=${encodeURIComponent(payload.text)}`;
    window.open(qqUrl, '_blank', 'noopener');
    return;
  }

  await copyShareLink(url);
}

async function copyShareLink(url) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showShareCopiedState();
    } else {
      throw new Error('Clipboard unavailable');
    }
  } catch {
    window.prompt('请复制链接：', url);
  }
}

function showShareCopiedState() {
  if (!shareTriggerButton) return;
  if (!shareTriggerButton.dataset.defaultText) {
    shareTriggerButton.dataset.defaultText = shareTriggerButton.textContent;
  }
  const original = shareTriggerButton.dataset.defaultText;
  shareTriggerButton.textContent = '链接已复制';
  setTimeout(() => {
    shareTriggerButton.textContent = original;
  }, 1400);
}

function showWechatModal(url) {
  if (!wechatModalEl || !wechatQRImgEl) return;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
  wechatQRImgEl.src = qrUrl;
  wechatModalEl.classList.add('show');
}

function createTransportIcon(item) {
  const type = detectTransportType(item);
  if (!type) return null;
  const span = document.createElement('span');
  span.className = `transport-icon ${type}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = transportIconSvg[type];
  return span;
}

function detectTransportType(item) {
  const text = `${item.title || ''} ${item.desc || ''} ${(item.tags || []).join(' ')}`;
  const has = (kw) => text.includes(kw);
  if (has('航班') || has('飞机') || /航|航班|航空/.test(item.title || '')) return 'plane';
  if (has('高铁') || has('火车') || has('列车') || has('动车')) return 'train';
  if (has('地铁') || has('公交') || has('巴士') || has('公共交通')) return 'bus';
  if (has('打车') || has('出租') || has('车程') || has('自驾') || has('驾车') || has('交通') || has('出发')) return 'car';
  return null;
}

const transportIconSvg = {
  plane: `<svg viewBox="0 0 24 24"><path d="M2.5 13L21 7l-3.5 6 3.5 6-18.5-6 6-2-6-2z" fill="currentColor"/></svg>`,
  train: `<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 012 2v8a4 4 0 01-4 4l2 2v1h-2l-3-3H10l-3 3H5v-1l2-2a4 4 0 01-4-4V5a2 2 0 012-2zm1 2v6h12V5H6zm1 9h10a2 2 0 002-2H5a2 2 0 002 2z" fill="currentColor"/></svg>`,
  car: `<svg viewBox="0 0 24 24"><path d="M5 11l1.2-3.6A3 3 0 019 6h6a3 3 0 012.8 1.4L19 11h1a2 2 0 012 2v5h-2a2 2 0 01-4 0H8a2 2 0 01-4 0H2v-5a2 2 0 012-2h1zm2.3-3l-.6 2h10.6l-.7-2a1 1 0 00-.9-.7H9a1 1 0 00-.9.7z" fill="currentColor"/></svg>`,
  bus: `<svg viewBox="0 0 24 24"><path d="M6 3h12a3 3 0 013 3v9a2 2 0 01-2 2v3h-2v-3H7v3H5v-3a2 2 0 01-2-2V6a3 3 0 013-3zm-1 5v4h14V8H5zm2 7a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z" fill="currentColor"/></svg>`
};

const tagIconMap = {
  plane: ['航班', '航空', '机票'],
  train: ['高铁/城际', '高铁', '火车', '火車', '动车', '列车'],
  car: ['交通', '打车', '出租', '自驾', '驾车', '车程', '出发', '到达', '返程'],
  bag: ['行李', '收拾', '整理'],
  hotel: ['住宿', '入住', '酒店', '民宿'],
  food: ['美食', '餐', '午餐', '晚餐', '早餐', '宴'],
  relax: ['温泉', '休息', '缓冲'],
  scenic: ['风景', '洱海', '古城', '古镇', '束河', '景', '湖', '游'],
  alert: ['关键控制点', '务必', '注意'],
  activity: ['活动', '游玩', '逛', '体验']
};

const tagIconSvg = {
  plane: `<svg viewBox="0 0 24 24"><path d="M2.5 13L21 7l-3.5 6 3.5 6-18.5-6 6-2-6-2z" fill="currentColor"/></svg>`,
  train: `<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 012 2v9a3 3 0 01-3 3l1 2v1h-2l-2-3H10l-2 3H6v-1l1-2a3 3 0 01-3-3V5a2 2 0 012-2zm1 2v6h12V5H6z" fill="currentColor"/></svg>`,
  car: `<svg viewBox="0 0 24 24"><path d="M5 11l1.2-3.6A3 3 0 019 6h6a3 3 0 012.8 1.4L19 11h1a2 2 0 012 2v5h-2a2 2 0 01-4 0H8a2 2 0 01-4 0H2v-5a2 2 0 012-2h1z" fill="currentColor"/></svg>`,
  bag: `<svg viewBox="0 0 24 24"><path d="M8 6V5a4 4 0 118 0v1h3a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h3zm2 0h4V5a2 2 0 00-4 0v1z" fill="currentColor"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24"><path d="M4 11V5a2 2 0 012-2h12a2 2 0 012 2v6h1a1 1 0 011 1v7h-2v-2H4v2H2v-7a1 1 0 011-1h1zm2-6v6h12V5H6zm1 9h4v-2H7v2zm6 0h4v-2h-4v2z" fill="currentColor"/></svg>`,
  food: `<svg viewBox="0 0 24 24"><path d="M6 3h2v7h2V3h2v7h2V3h2v10h-2v8H8v-8H6V3zm12 0h3v8a3 3 0 01-3 3v-3h-1V3h1z" fill="currentColor"/></svg>`,
  relax: `<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 016 6v2h2v8a2 2 0 01-2 2h-3l-1-2h-4l-1 2H6a2 2 0 01-2-2v-8h2V9a6 6 0 016-6zm0 2a4 4 0 00-4 4v2h8V9a4 4 0 00-4-4z" fill="currentColor"/></svg>`,
  scenic: `<svg viewBox="0 0 24 24"><path d="M3 17l4-5 3 4 4-6 7 9H3zm9-9a3 3 0 110-6 3 3 0 010 6z" fill="currentColor"/></svg>`,
  alert: `<svg viewBox="0 0 24 24"><path d="M2 20l10-16 10 16H2zm10-3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-1-7v5h2v-5h-2z" fill="currentColor"/></svg>`,
  activity: `<svg viewBox="0 0 24 24"><path d="M12 2l2.5 6.5L21 9l-4.5 4 1.5 6-5-3.5L8 19l1.5-6L5 9l6.5-.5L12 2z" fill="currentColor"/></svg>`
};

function detectTagIcon(tag) {
  if (!tag) return null;
  const lowerTag = tag.toLowerCase();
  for (const [key, keywords] of Object.entries(tagIconMap)) {
    if (keywords.some((kw) => tag.includes(kw) || lowerTag.includes(kw.toLowerCase()))) {
      return key;
    }
  }
  return null;
}

function createTagChip(tag) {
  const span = document.createElement('span');
  span.className = 'tag';
  const iconName = detectTagIcon(tag);
  if (iconName && tagIconSvg[iconName]) {
    const iconSpan = document.createElement('span');
    iconSpan.className = `tag-icon ${iconName}`;
    iconSpan.innerHTML = tagIconSvg[iconName];
    span.appendChild(iconSpan);
  }
  span.appendChild(document.createTextNode(tag));
  return span;
}

const heroVariants = [
  {
    eyebrow: 'YUNNAN / 旅拍',
    title: '云海花田里的慢旅行',
    desc: '洱海边的木栈道与粉色云霞，把云南的柔软时光折叠进卡片行程里。',
    badgeMain: '大理 · 丽江 · 昆明',
    badgeSub: '最佳 6-8 日 | 18-26℃',
    image: './images/hero-yunnan.jpg',
    imageAlt: '洱海与花田旅拍氛围'
  },
  {
    eyebrow: 'SEASIDE / DALI',
    title: '在洱海边捧一杯云朵咖啡',
    desc: '移动咖啡车、白色露台与天空同色，随手记录都像 Pinterest moodboard。',
    badgeMain: '大理 · 海东 · 环湖西路',
    badgeSub: '清晨柔光拍照最佳',
    image: './images/mood-cafe.jpg',
    imageAlt: '洱海西岸移动咖啡车'
  },
  {
    eyebrow: 'LIJIANG / NIGHT GLOW',
    title: '古城蓝调夜与石板路',
    desc: '灯串和青石巷交错，夜晚散步像走进童话灯箱，适合浪漫胶片风。',
    badgeMain: '丽江古城 · 青石巷',
    badgeSub: '夜拍小贴士：ISO 800',
    image: './images/mood-lijiang.jpg',
    imageAlt: '丽江古城的夜色'
  },
  {
    eyebrow: 'KUNMING / BLOOM',
    title: '春城花市的色彩胶囊',
    desc: '把干花与香料装进随身托特，每一束都是云南旅途的小战利品。',
    badgeMain: '昆明 · 春城花市',
    badgeSub: '挑选时间：上午 10 点前',
    image: './images/mood-market.jpg',
    imageAlt: '昆明花市氛围图'
  }
];

function applyHeroVariant() {
  const variant = heroVariants[Math.floor(Math.random() * heroVariants.length)];
  const heroEyebrow = document.getElementById('heroEyebrow');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const heroImage = document.getElementById('heroImage');
  const badgeMainText = document.getElementById('heroBadgeMainText');
  const badgeSubText = document.getElementById('heroBadgeSubText');

  if (!heroTitle || !heroDesc || !heroImage) return;
  if (heroEyebrow) heroEyebrow.textContent = variant.eyebrow || 'YUNNAN / 旅拍';
  heroTitle.textContent = variant.title || '';
  heroDesc.textContent = variant.desc || '';
  if (badgeMainText) badgeMainText.textContent = variant.badgeMain || '';
  if (badgeSubText) badgeSubText.textContent = variant.badgeSub || '';
  heroImage.src = variant.image || heroImage.src;
  heroImage.alt = variant.imageAlt || variant.title || heroImage.alt;
}

const baseMoodboardShots = [
  {
    city: '大理',
    src: './images/mood-dali.jpg',
    alt: '大理洱海的清晨',
    location: '大理 · 洱海木栈道',
    season: '3-5 月 · 清晨柔光',
    caption: '晨光落在湖面和木栈道上，自带手账滤镜感'
  },
  {
    city: '大理',
    src: './images/mood-cafe.jpg',
    alt: '洱海西岸的移动咖啡车',
    location: '大理 · 洱海西岸露营地',
    season: '9-11 月 · 日落咖啡',
    caption: '复古咖啡车 + 白色露台，随手也能拍出 Pinterest 风'
  },
  {
    city: '丽江',
    src: './images/mood-lijiang.jpg',
    alt: '丽江古城石板路夜色',
    location: '丽江 · 古城青石巷',
    season: '10-12 月 · 蓝调夜',
    caption: '灯串与青石巷交错，夜晚散步像走进童话灯箱'
  },
  {
    city: '丽江',
    src: './images/mood-trail.jpg',
    alt: '玉龙雪山的木栈道',
    location: '丽江 · 玉龙雪山徒步',
    season: '1-3 月 · 雪山阳光',
    caption: '薄雾、雪峰与木栈道的层次，很像胶片分区曝光'
  },
  {
    city: '昆明',
    src: './images/mood-market.jpg',
    alt: '昆明花市里的花束和摊位',
    location: '昆明 · 春城花市',
    season: '全年 · 恒春花市',
    caption: '永生花与干草束，把昆明的色彩装进随身托特'
  },
  {
    city: '昆明',
    src: './images/mood-kunming-park.jpg',
    alt: '昆明翠湖公园的湖面与廊桥',
    location: '昆明 · 翠湖公园',
    season: '4-6 月 · 绿意满分',
    caption: '松影和湖水倒影让城市节奏慢下来'
  },
  {
    city: '玉溪',
    src: './images/mood-yuanyang.jpg',
    alt: '元阳梯田的晨雾',
    location: '玉溪 · 元阳梯田',
    season: '1-2 月 · 水田倒影',
    caption: '金色云雾缠绕梯田，像调色盘撒在山谷里'
  },
  {
    city: '玉溪',
    src: './images/mood-yuxi-lake.jpg',
    alt: '玉溪抚仙湖的日落剪影',
    location: '玉溪 · 抚仙湖',
    season: '7-9 月 · 湖畔消暑',
    caption: '玻璃蓝的湖面与渔船剪影，适合大片构图'
  }
];

const extraMoodboardShots = [
  {
    city: '大理',
    src: './images/mood-dali-alley.jpg',
    alt: '大理古城白墙青瓦的巷子',
    location: '大理 · 古城里仁巷',
    season: '全年 · 慢巷散步',
    caption: '白墙青瓦与植物藤蔓的对比，构图感极强'
  },
  {
    city: '大理',
    src: './images/mood-dali-boat.jpg',
    alt: '洱海上漂浮的木船',
    location: '大理 · 海舌公园',
    season: '4-6 月 · 晴朗倒影',
    caption: '木船、云朵和水面的对称，适合极简风'
  },
  {
    city: '丽江',
    src: './images/mood-lijiang-morning.jpg',
    alt: '丽江清晨的庭院与茶桌',
    location: '丽江 · 束河庭院',
    season: '3-5 月 · 茶香晨雾',
    caption: '藤椅、花影与茶具打造日系慵懒感'
  },
  {
    city: '丽江',
    src: './images/mood-lijiang-tea.jpg',
    alt: '雪山脚下晴空与草地',
    location: '丽江 · 玉湖村',
    season: '5-6 月 · 草甸野餐',
    caption: '雪山与绿野对比鲜明，适合露营拍照'
  },
  {
    city: '昆明',
    src: './images/mood-kunming-tea.jpg',
    alt: '昆明茶室里的竹编与绿植',
    location: '昆明 · 盘龙茶馆',
    season: '11-2 月 · 暖茶午后',
    caption: '竹编灯与绿植搭配，营造治愈系静物'
  },
  {
    city: '玉溪',
    src: './images/mood-yuxi-sunset.jpg',
    alt: '玉溪山谷的日落云海',
    location: '玉溪 · 新平哀牢山',
    season: '10-12 月 · 云海季',
    caption: '山谷被云海覆盖，适合广角纪录'
  }
];

const INITIAL_MOODBOARD_COUNT = 6;

function shuffleShots(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderMoodboardShots(grid, shots) {
  const frag = document.createDocumentFragment();
  shots.forEach((shot) => {
    const captionChildren = [];
    if (shot.location) {
      captionChildren.push(el('span', { class: 'mood-location' }, shot.location));
    }
    if (shot.season) {
      captionChildren.push(el('span', { class: 'mood-season' }, shot.season));
    }
    if (shot.caption) {
      captionChildren.push(el('span', { class: 'mood-caption' }, shot.caption));
    }

    const figure = el('figure', { class: 'mood-card' }, [
      el('img', { src: shot.src, alt: shot.alt || '', loading: 'lazy' }),
      el('figcaption', {}, captionChildren)
    ]);
    frag.appendChild(figure);
  });
  grid.appendChild(frag);
}

function initMoodboardLazyLoad() {
  const grid = document.getElementById('moodboardGrid');
  const btn = document.getElementById('btnRevealMoodboard');
  const overlay = document.getElementById('moodboardOverlay');
  if (!grid || !btn) return;
  const allShots = shuffleShots([...baseMoodboardShots, ...extraMoodboardShots]);
  const initialShots = allShots.slice(0, INITIAL_MOODBOARD_COUNT);
  const remainingShots = allShots.slice(INITIAL_MOODBOARD_COUNT);
  renderMoodboardShots(grid, initialShots);
  if (!remainingShots.length) {
    overlay?.classList.add('hidden');
    return;
  }
  let loaded = false;
  btn.addEventListener('click', () => {
    if (!loaded) {
      renderMoodboardShots(grid, remainingShots);
      loaded = true;
      btn.textContent = '已展开';
      btn.disabled = true;
    }
    overlay?.classList.add('hidden');
  });
}

function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: '当前位置'
        });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 5 * 60 * 1000
      }
    );
  });
}

async function fetchIpLocation() {
  const endpoints = [
    'https://ipapi.co/json/',
    'https://ipwho.is/?fields=city,region,country,country_code,latitude,longitude'
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const city = data.city || data.region || '';
      const country = data.country_name || data.country || data.country_code || '';
      if (data.latitude && data.longitude) {
        return {
          lat: data.latitude,
          lon: data.longitude,
          label: [city, country].filter(Boolean).join(' · ') || '当前城市'
        };
      }
    } catch {
      /* ignore and try next endpoint */
    }
  }
  throw new Error('无法通过 IP 获得定位');
}

async function resolveLocation() {
  try {
    return await requestBrowserLocation();
  } catch {
    return await fetchIpLocation();
  }
}

async function reverseGeocode(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    count: '1',
    language: 'zh'
  });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?${params.toString()}`);
  if (!res.ok) throw new Error('反向地理编码失败');
  const data = await res.json();
  const first = data?.results?.[0];
  if (!first) return '';
  const parts = [
    first.city || first.name || '',
    first.district || first.admin1 || '',
    first.country || ''
  ].filter(Boolean);
  return parts.join(' · ');
}

async function enrichLocationLabel(location) {
  if (!location) return location;
  if (location.label && location.label !== '当前位置') return location;
  try {
    const name = await reverseGeocode(location.lat, location.lon);
    if (name) return { ...location, label: name };
  } catch {
    /* ignore reverse geocode errors */
  }
  return location;
}

function describeWeatherCode(code) {
  const map = {
    0: '晴朗',
    1: '多云',
    2: '多云',
    3: '阴天',
    45: '有雾',
    48: '有雾',
    51: '毛毛雨',
    53: '细雨',
    55: '小雨',
    56: '冻雨',
    57: '冻雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '短时小雨',
    81: '阵雨',
    82: '强阵雨',
    85: '阵雪',
    86: '强阵雪',
    95: '雷阵雨',
    96: '雷雨伴冰雹',
    99: '强雷雨伴冰雹'
  };
  return map[code] || '户外天气';
}

function getOutfitSuggestion(temp) {
  if (temp >= 28) return '短袖 + 防晒衫，注意补水';
  if (temp >= 22) return '轻薄长袖 + 迷你外套最舒服';
  if (temp >= 16) return '卫衣或针织 + 防风外套';
  if (temp >= 10) return '薄羽绒/冲锋衣，早晚披上';
  return '保暖内搭 + 厚外套，围巾别忘了';
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current_weather: 'true',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto'
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw new Error('天气接口请求失败');
  const data = await res.json();
  if (!data.current_weather) throw new Error('缺少天气数据');
  return {
    temp: data.current_weather.temperature,
    wind: data.current_weather.windspeed,
    code: data.current_weather.weathercode,
    max: data.daily?.temperature_2m_max?.[0],
    min: data.daily?.temperature_2m_min?.[0]
  };
}

async function initWeatherWidget() {
  const statusEl = document.getElementById('weatherStatus');
  const tempEl = document.getElementById('weatherTemp');
  const metaEl = document.getElementById('weatherMeta');
  const tipEl = document.getElementById('weatherTip');
  const locationEl = document.getElementById('weatherLocation');
  if (!statusEl || !tempEl || !metaEl || !tipEl || !locationEl) return;

  try {
    statusEl.textContent = '定位中...';
    const baseLocation = await resolveLocation();
    const location = await enrichLocationLabel(baseLocation);
    const fallbackCoords =
      typeof location.lat === 'number' && typeof location.lon === 'number'
        ? `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`
        : '';
    const labelText = location.label || fallbackCoords || '某个可爱的角落';
    locationEl.textContent = `当前位置：${labelText}`;
    statusEl.textContent = '今日天气';
    const weather = await fetchWeather(location.lat, location.lon);
    const roundedTemp = Math.round(weather.temp);
    tempEl.textContent = `${roundedTemp}℃`;
    const desc = describeWeatherCode(weather.code);
    const windText = `风速 ${Math.round(weather.wind)}km/h`;
    const highLow = [weather.max, weather.min].every((v) => typeof v === 'number')
      ? ` · ${Math.round(weather.min)}℃~${Math.round(weather.max)}℃`
      : '';
    metaEl.textContent = `${desc} · ${windText}${highLow}`;
    tipEl.textContent = getOutfitSuggestion(roundedTemp);
  } catch (err) {
    statusEl.textContent = '天气获取失败';
    tempEl.textContent = '--';
    metaEl.textContent = '尝试刷新页面或稍后重试';
    tipEl.textContent = '带上心爱的小外套以防万一';
    locationEl.textContent = '';
    console.error(err);
  }
}

(async function main() {
  try {
    const data = await loadData();
    applyHeroVariant();

    // Headline
    document.getElementById('tripTitle').textContent = data.site?.title || '行程';
    document.getElementById('tripSubtitle').textContent = data.site?.subtitle || '';
    document.getElementById('footerNote').textContent = data.site?.footerNote || '';

    // Overview
    renderKV(document.getElementById('overview'), data.overview || {});

    // Advice blocks
    renderNotes(document.getElementById('stayAdvice'), data.stayAdvice || []);
    renderNotes(document.getElementById('packingAdvice'), data.packingAdvice || []);

    // Timeline
    const timelineEl = document.getElementById('timeline');
    const itinerary = data.itinerary || [];
    renderTimeline(timelineEl, itinerary);

    // Chips filter
    renderChips(document.getElementById('chips'), itinerary, (idx) => {
      if (idx === null) renderTimeline(timelineEl, itinerary);
      else renderTimeline(timelineEl, [itinerary[idx]]);
    });

    setupActions(data);
    initWeatherWidget();
    initMoodboardLazyLoad();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:24px;font-family:system-ui;color:#fff;background:#0b0f14">
      <h2>页面加载失败</h2>
      <p>请确认 <code>data.json</code> 与 <code>app.js</code> 在同一目录，且通过 Web 服务器访问（不要直接双击打开 html）。</p>
      <pre style="white-space:pre-wrap;opacity:.9">${String(e)}</pre>
    </div>`;
  }
})();
