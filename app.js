(() => {
  'use strict';
  const config = window.BUTTERFLY_CONFIG || {};
  const remote = Boolean(config.url && config.anonKey);
  const endpoint = (path) => `${config.url.replace(/\/$/, '')}${path}`;
  const STORE_KEY = 'butterfly-archive-v2';
  const $ = (sel) => document.querySelector(sel);
  const grid = $('#specimen-grid');
  const gridEmpty = $('#archive-empty');
  let specimens = [];
  let selectedCategory = '전체';
  let chosenPhoto = null;
  let cameraStream = null;
  let toastTimer;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = (extra = {}) => ({ apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, ...extra });
  const announce = (message) => {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  };
  const setConnection = (label, state = '') => {
    const el = $('#connection-state'); el.className = `connection-state ${state}`; el.innerHTML = `<i></i>${escapeHTML(label)}`;
  };
  const dateLabel = (value) => {
    const d = new Date(value); if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  const listCategories = () => [...new Set(specimens.map((s) => s.category).filter((name) => name && name !== '진짜 나비'))];
  const applyRequestedCategory = () => {
    const requested = new URLSearchParams(location.search).get('category');
    if (requested && listCategories().includes(requested)) selectedCategory = requested;
  };

  function updateCategoryControls() {
    const all = listCategories();
    const list = $('#category-list');
    list.innerHTML = ['전체', ...all].map((name) => `<button class="category-chip ${selectedCategory === name ? 'selected' : ''}" data-category="${escapeHTML(name)}">${escapeHTML(name)}${name === '전체' ? ` <span>${String(specimens.length).padStart(2, '0')}</span>` : ''}</button>`).join('');
    list.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      selectedCategory = button.dataset.category; updateCategoryControls(); renderSpecimens();
    }));
  }

  function renderSpecimens() {
    const query = $('#search-input').value.trim().toLowerCase();
    const filtered = specimens.filter((s) => (selectedCategory === '전체' || s.category === selectedCategory) && (!query || `${s.name} ${s.category} ${s.description || ''}`.toLowerCase().includes(query)));
    $('#result-label').textContent = selectedCategory === '전체' ? '최근 등록된 표본' : `${selectedCategory} 카테고리`;
    if ($('#nav-count')) $('#nav-count').textContent = String(specimens.length).padStart(2, '0');
    $('#collection-count').textContent = `(${String(specimens.length).padStart(2, '0')})`;
    gridEmpty.hidden = filtered.length !== 0;
    $('#load-error').hidden = true;
    grid.innerHTML = filtered.map((s, index) => `<article class="specimen-card specimen-size-${index % 6}" tabindex="0" role="button" aria-label="표본 ${escapeHTML(s.name)} 자세히 보기" data-id="${escapeHTML(s.id)}"><div class="card-image-wrap"><img class="card-image" src="${escapeHTML(s.image_url || 'assets/hero-butterfly.png')}" alt="${escapeHTML(s.name)}" loading="lazy" /><span class="card-number">${String(specimens.indexOf(s) + 1).padStart(3, '0')}</span><span class="card-category">${escapeHTML(s.category)}</span></div><div class="card-meta"><span class="card-name">${escapeHTML(s.name)}</span><time class="card-date">${dateLabel(s.created_at)}</time></div>${s.description ? `<p class="card-description">${escapeHTML(s.description)}</p>` : ''}</article>`).join('');
    grid.querySelectorAll('.specimen-card').forEach((card) => {
      const open = () => showDetail(card.dataset.id); card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  async function loadSpecimens() {
    if (!remote) {
      try { specimens = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; }
      catch { specimens = []; }
      specimens = specimens.filter((item) => !String(item.id).startsWith('preview-') && item.category !== '진짜 나비');
      localStorage.setItem(STORE_KEY, JSON.stringify(specimens));
      applyRequestedCategory(); setConnection('로컬 미리보기 · 이 기기에만 저장', 'offline'); updateCategoryControls(); renderSpecimens(); return;
    }
    setConnection('공개 인덱스 불러오는 중');
    $('#load-error').hidden = true;
    try {
      const response = await fetch(endpoint('/rest/v1/specimens?select=*&order=created_at.desc'), { headers: headers() });
      if (!response.ok) throw new Error(await response.text());
      specimens = (await response.json()).filter((item) => item.category !== '진짜 나비'); applyRequestedCategory(); setConnection('모두의 인덱스 연결됨', 'connected'); updateCategoryControls(); renderSpecimens();
    } catch (error) {
      console.error('Archive load failed:', error); setConnection('연결 오류', 'offline'); grid.innerHTML = ''; gridEmpty.hidden = true; $('#load-error').hidden = false;
    }
  }

  function showDetail(id) {
    const item = specimens.find((s) => String(s.id) === String(id)); if (!item) return;
    const facts = [
      ['관찰일', item.observed_on && dateLabel(item.observed_on)],
      ['발견 장소', item.location],
      ['크기', item.dimensions],
      ['색과 무늬', item.color_pattern],
      ['재질', item.material],
      ['형태', item.form]
    ].filter(([, value]) => value);
    const factsMarkup = facts.length ? `<dl class="detail-facts">${facts.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>` : '';
    $('#detail-content').innerHTML = `<div class="detail-layout"><img src="${escapeHTML(item.image_url || 'assets/orange-butterfly.png')}" alt="${escapeHTML(item.name)}"/><div class="detail-copy"><p class="eyebrow">모두의 인덱스에 기록된 표본</p><h2>${escapeHTML(item.name)}</h2><p class="detail-category">${escapeHTML(item.category)}</p>${factsMarkup}<p class="detail-description">${escapeHTML(item.description || '아직 적힌 이야기가 없습니다.')}</p><p class="detail-date">등록일 ${dateLabel(item.created_at)}</p><button class="delete-specimen" id="delete-specimen" type="button" data-id="${escapeHTML(item.id)}">이 표본 삭제 <span>×</span></button></div></div>`;
    $('#detail-dialog').showModal();
    $('#delete-specimen').addEventListener('click', () => deleteSpecimen(item));
  }

  async function deleteSpecimen(item) {
    if (!window.confirm(`“${item.name}” 표본을 삭제할까요? 삭제 후에는 복구할 수 없습니다.`)) return;
    const button = $('#delete-specimen');
    button.disabled = true; button.textContent = '삭제 중…';
    try {
      if (remote) {
        const response = await fetch(endpoint(`/rest/v1/specimens?id=eq.${encodeURIComponent(item.id)}`), { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
        if (!response.ok) throw new Error('삭제할 수 없습니다. Supabase의 삭제 권한 설정을 확인해 주세요.');
        const imagePrefix = '/storage/v1/object/public/specimen-images/';
        const imagePath = item.image_url?.includes(imagePrefix) ? decodeURIComponent(item.image_url.split(imagePrefix)[1]) : '';
        if (imagePath) {
          const imageResponse = await fetch(endpoint(`/storage/v1/object/specimen-images/${imagePath.split('/').map(encodeURIComponent).join('/')}`), { method: 'DELETE', headers: headers() });
          if (!imageResponse.ok) console.warn('Specimen removed, but its image could not be deleted.');
        }
      } else {
        specimens = specimens.filter((specimen) => String(specimen.id) !== String(item.id));
        localStorage.setItem(STORE_KEY, JSON.stringify(specimens));
      }
      specimens = specimens.filter((specimen) => String(specimen.id) !== String(item.id));
      updateCategoryControls(); renderSpecimens(); $('#detail-dialog').close();
      announce('표본을 삭제했어요.');
    } catch (error) {
      button.disabled = false; button.innerHTML = '이 표본 삭제 <span>×</span>';
      announce(error.message || '삭제하지 못했어요. 다시 시도해 주세요.');
    }
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택해 주세요.');
    if (file.size > 8 * 1024 * 1024) throw new Error('8MB 이하의 사진을 선택해 주세요.');
    const source = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height); source.close?.();
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', .84));
  }

  function setPhoto(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { $('#form-error').textContent = '8MB 이하의 사진을 선택해 주세요.'; $('#form-error').hidden = false; return; }
    chosenPhoto = file; const preview = $('#photo-preview'); preview.src = URL.createObjectURL(file); preview.hidden = false; $('#picker-placeholder').hidden = true; $('#form-error').hidden = true;
  }

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null; $('#camera-video').srcObject = null; $('#capture-photo').disabled = true;
    $('#camera-placeholder').hidden = false;
  }

  async function openCamera() {
    const dialog = $('#camera-dialog');
    if (!dialog.open) dialog.showModal();
    $('#camera-error').hidden = true; $('#capture-photo').disabled = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#camera-error').textContent = '이 브라우저에서는 페이지 안 카메라를 사용할 수 없습니다. 아래 버튼으로 기기 카메라를 열어주세요.';
      $('#camera-error').hidden = false; return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!dialog.open) { stream.getTracks().forEach((track) => track.stop()); return; }
      cameraStream = stream;
      const video = $('#camera-video'); video.srcObject = cameraStream;
      await video.play(); $('#camera-placeholder').hidden = true; $('#capture-photo').disabled = false;
    } catch (error) {
      $('#camera-placeholder').hidden = false;
      $('#camera-error').textContent = error.name === 'NotAllowedError'
        ? '카메라 접근이 허용되지 않았습니다. 브라우저 설정에서 권한을 확인하거나 기기 카메라를 열어주세요.'
        : '카메라를 시작하지 못했습니다. 기기 카메라를 사용해 주세요.';
      $('#camera-error').hidden = false;
    }
  }

  async function capturePhoto() {
    const video = $('#camera-video');
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!blob) { $('#camera-error').textContent = '사진을 만들지 못했습니다. 한 번 더 촬영해 주세요.'; $('#camera-error').hidden = false; return; }
    setPhoto(new File([blob], `specimen-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    $('#camera-dialog').close();
  }

  async function uploadPhoto(file) {
    const blob = await compressImage(file);
    if (!remote) return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    const path = `${Date.now()}-${crypto.randomUUID()}.jpg`;
    const response = await fetch(endpoint(`/storage/v1/object/specimen-images/${path}`), { method: 'POST', headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: blob });
    if (!response.ok) throw new Error('사진을 올리지 못했어요. 저장소 설정을 확인해 주세요.');
    return endpoint(`/storage/v1/object/public/specimen-images/${path}`);
  }

  async function saveSpecimen(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const category = String(data.get('category') || '').trim();
    const errorBox = $('#form-error'); errorBox.hidden = true;
    if (!name || !category) { errorBox.textContent = '이름과 카테고리를 적어주세요.'; errorBox.hidden = false; return; }
    if (category === '진짜 나비') { errorBox.textContent = '진짜 나비는 이 도감에 기록하지 않아요.'; errorBox.hidden = false; return; }
    if (!chosenPhoto) { errorBox.textContent = '표본 사진을 먼저 선택해 주세요.'; errorBox.hidden = false; return; }
    const button = $('#submit-specimen'); button.disabled = true; button.textContent = '인덱스에 기록 중…';
    try {
      const image_url = await uploadPhoto(chosenPhoto);
      const record = {
        name, category, image_url,
        observed_on: String(data.get('observed_on') || '') || null,
        location: String(data.get('location') || '').trim(),
        dimensions: String(data.get('dimensions') || '').trim(),
        color_pattern: String(data.get('color_pattern') || '').trim(),
        material: String(data.get('material') || '').trim(),
        form: String(data.get('form') || '').trim(),
        description: String(data.get('description') || '').trim()
      };
      if (remote) {
        const response = await fetch(endpoint('/rest/v1/specimens'), { method: 'POST', headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(record) });
        if (!response.ok) throw new Error('표본을 저장하지 못했어요. 공개 테이블 설정을 확인해 주세요.');
        const result = await response.json(); specimens = [...result, ...specimens];
      } else {
        record.id = `local-${Date.now()}`; record.created_at = new Date().toISOString(); specimens = [record, ...specimens]; localStorage.setItem(STORE_KEY, JSON.stringify(specimens));
      }
      selectedCategory = '전체'; updateCategoryControls(); renderSpecimens(); $('#upload-dialog').close(); form.reset(); chosenPhoto = null; $('#photo-preview').hidden = true; $('#photo-preview').removeAttribute('src'); $('#picker-placeholder').hidden = false;
      announce(remote ? '모두의 인덱스에 기록했어요.' : '이 기기의 미리보기에 기록했어요.'); document.querySelector('#archive').scrollIntoView({ behavior: 'smooth' });
    } catch (error) { errorBox.textContent = error.message || '저장하지 못했어요. 다시 시도해 주세요.'; errorBox.hidden = false; }
    finally { button.disabled = false; button.innerHTML = '인덱스에 기록하기 <span>↗</span>'; }
  }

  const openUpload = () => $('#upload-dialog').showModal();
  ['#open-upload', '#empty-add', '#about-add'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('click', openUpload); });
  $('#close-upload').addEventListener('click', () => $('#upload-dialog').close());
  $('#close-detail').addEventListener('click', () => $('#detail-dialog').close());
  $('#photo-file').addEventListener('change', (e) => setPhoto(e.target.files[0]));
  $('#camera-file').addEventListener('change', (e) => { if (e.target.files[0]) { setPhoto(e.target.files[0]); $('#camera-dialog').close(); } });
  $('#open-camera').addEventListener('click', openCamera);
  $('#close-camera').addEventListener('click', () => $('#camera-dialog').close());
  $('#camera-dialog').addEventListener('close', stopCamera);
  $('#camera-fallback').addEventListener('click', () => $('#camera-file').click());
  $('#capture-photo').addEventListener('click', capturePhoto);
  $('#specimen-form').addEventListener('submit', saveSpecimen);
  $('#search-input').addEventListener('input', renderSpecimens);
  $('#retry-load').addEventListener('click', loadSpecimens);
  const picker = $('#photo-picker');
  ['dragenter', 'dragover'].forEach((type) => picker.addEventListener(type, (e) => { e.preventDefault(); picker.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((type) => picker.addEventListener(type, (e) => { e.preventDefault(); picker.classList.remove('dragover'); }));
  picker.addEventListener('drop', (e) => setPhoto(e.dataTransfer.files[0]));
  document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => { document.querySelectorAll('.main-nav a').forEach((a) => a.classList.remove('active')); link.classList.add('active'); }));
  loadSpecimens().then(() => {
    if (new URLSearchParams(location.search).get('add') === '1') openUpload();
  });
})();
