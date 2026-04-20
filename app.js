
// ═══════════════════════════════════════════════════════════════
// CS-ENGINE · CSV 연동 데이터 로더
// 모든 데이터는 db/ems/*.csv / db/yun/*.csv 에서 fetch로 로딩됨
// index.html 내부에 데이터를 절대 하드코딩하지 않는 구조
// ═══════════════════════════════════════════════════════════════

let EMS = {}, YUN = {}, SF = {}, CFG = {};

/**
 * 강건한 CSV 파서
 * - UTF-8 BOM 제거
 * - 따옴표로 감싼 필드(쉼표·줄바꿈 포함) 처리
 * - 빈 행 무시
 */
function parseCSV(raw) {
  // BOM 제거
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  const rows = [];
  let i = 0, n = raw.length;

  function skipLineEnd() {
    while (i < n && (raw[i] === '\r' || raw[i] === '\n')) i++;
  }

  function readField() {
    if (raw[i] === '"') {
      i++; // 여는 따옴표 건너뜀
      let val = '';
      while (i < n) {
        if (raw[i] === '"') {
          i++;
          if (i < n && raw[i] === '"') { val += '"'; i++; } // "" → "
          else break; // 닫는 따옴표
        } else {
          val += raw[i++];
        }
      }
      return val;
    } else {
      let val = '';
      while (i < n && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') {
        val += raw[i++];
      }
      return val;
    }
  }

  // 헤더 행 파싱
  const headers = [];
  while (i < n && raw[i] !== '\n' && raw[i] !== '\r') {
    headers.push(readField());
    if (i < n && raw[i] === ',') i++;
  }
  skipLineEnd();

  // 데이터 행 파싱
  while (i < n) {
    // 빈 행 건너뜀
    let peek = i;
    while (peek < n && (raw[peek] === '\r' || raw[peek] === '\n')) peek++;
    if (peek >= n) break;
    if (raw[peek] === '' || peek === n) break;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = readField();
      if (j < headers.length - 1 && i < n && raw[i] === ',') i++;
    }
    // 행 끝 개행 문자 건너뜀
    skipLineEnd();
    rows.push(row);
  }
  return rows;
}

/**
 * schema.json → 모든 CSV 병렬 fetch → EMS / YUN 객체 완성
 */
async function loadAllCSVs() {
  const base = (function() {
    // GitHub Pages: /cs-engine/  or  로컬: /
    const p = location.pathname;
    const dir = p.endsWith('/') ? p : p.substring(0, p.lastIndexOf('/') + 1);
    return dir;
  })();

  const [schema, config] = await Promise.all([
    fetch(base + 'db/schema.json').then(r => {
      if (!r.ok) throw new Error('schema.json 로딩 실패: ' + r.status);
      return r.json();
    }),
    fetch(base + 'db/config.json').then(r => {
      if (!r.ok) throw new Error('config.json 로딩 실패: ' + r.status);
      return r.json();
    })
  ]);
  CFG = config;

  const fetchCSV = (path) =>
    fetch(base + path).then(r => {
      if (!r.ok) throw new Error(path + ' 로딩 실패: ' + r.status);
      return r.text();
    });

  const [emsResults, yunResults, sfResults] = await Promise.all([
    Promise.all(schema.ems.map(k =>
      fetchCSV('db/ems/' + k + '.csv').then(t => ({ key: k, data: parseCSV(t) }))
    )),
    Promise.all(schema.yun.map(k =>
      fetchCSV('db/yun/' + k + '.csv').then(t => ({ key: k, data: parseCSV(t) }))
    )),
    Promise.all(schema.sf.map(k =>
      fetchCSV('db/sf/' + k + '.csv').then(t => ({ key: k, data: parseCSV(t) }))
    ))
  ]);

  emsResults.forEach(({ key, data }) => { EMS[key] = data; });
  yunResults.forEach(({ key, data }) => { YUN[key] = data; });
  sfResults.forEach(({ key, data }) => { SF[key] = data; });
}

/**
 * 앱 초기화 (CSV 로딩 완료 후 실행)
 */
function initApp() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';

  // EMS 국가별 발송조건 드롭다운 초기화
  buildEmsCountryOptions(EMS_COUNTRIES);

  // YUN 국가 select 옵션
  const sel = document.getElementById('rc');
  YUN.countries.forEach(c=>{
    const o=document.createElement('option'); o.value=c['국가코드']; o.text=c['국가명']+' ('+c['국가코드']+')'; sel.appendChild(o);
  });
  document.getElementById('brand-badge').textContent = YUN.brands.length+'개';

  // 초기 렌더
  searchItems(); searchBrands(); searchVAT(); searchSize();
  renderEMSItems(); renderComp(); renderRules(); renderFAQ('ems'); renderTracking();
  renderCountryCond(); renderRegions(); renderContract();
  renderInsurance();
  renderIpSites();
  // SF 초기 렌더
  renderSFLeadTime();
  renderSFItems();
  renderSFCustoms();
  renderSFDelivery();
  renderSFComp();
  renderFAQ('sf');
}

// ── 앱 시작: CSV 로딩 → 초기화 ──
loadAllCSVs()
  .then(initApp)
  .catch(err => {
    const errEl = document.getElementById('loading-err');
    if (errEl) {
      errEl.style.display = 'block';
      errEl.textContent = '로딩 실패: ' + err.message + ' (콘솔 확인)';
    }
    console.error('[CS-Engine] CSV 로딩 오류:', err);
  });


// ── SERVICE SWITCH ──
function selectSvc(svc) {
  document.querySelectorAll('.svc-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-'+svc).classList.add('active');
  document.getElementById('svc-yun').className = 'svc-btn' + (svc==='yun'?' yun-active':'');
  document.getElementById('svc-ems').className = 'svc-btn' + (svc==='ems'?' ems-active':'');
  document.getElementById('svc-sf').className  = 'svc-btn' + (svc==='sf'?' sf-active':'');
}

// ── TAB SWITCH ──
function showTab(svc, id, btn) {
  const panel = document.getElementById('panel-'+svc);
  panel.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

// ── MODAL ──
function closeModal(e) {
  if (e && e.target !== document.getElementById('map-modal')) return;
  document.getElementById('map-modal').classList.remove('open');
}
document.addEventListener('keydown', e => {
  if(e.key==='Escape') {
    document.getElementById('map-modal').classList.remove('open');
    closeIframeModal();
  }
});

// ── EMS 우체국 iframe 모달 ──
function openIframeModal(url, title) {
  document.getElementById('epost-modal-title').textContent = title || '우체국 안내';
  document.getElementById('epost-modal-frame').src = url;
  document.getElementById('epost-modal-link').href = url;
  document.getElementById('epost-modal').classList.add('open');
}
function closeIframeModal(e) {
  const el = document.getElementById('epost-modal');
  if (e && e.target !== el) return;
  el.classList.remove('open');
  document.getElementById('epost-modal-frame').src = '';
}

// ── HELPERS ──
function hl(t, kw) {
  if(!kw||!t) return t||'';
  return t.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'), m=>'<span class="hl">'+m+'</span>');
}
function findW(rates, w, field) {
  const f = field||'무게_g';
  for(const r of rates) if(parseFloat(r[f])>=w) return r;
  return rates[rates.length-1];
}

// ── INIT: loadAllCSVs().then(initApp) 에서 처리되므로 즉시실행 불필요 ──

// ══ 격오지(Remote Area) 조회 함수 ══

function resetRemoteZip() {
  document.getElementById('rz-input').value = '';
  document.getElementById('rz-result').innerHTML = '';
  document.getElementById('rz-surcharge').innerHTML = '';
}

function searchRemoteZip() {
  const country = document.getElementById('rz-country').value;
  const input   = (document.getElementById('rz-input').value || '').trim().toUpperCase();
  const resEl   = document.getElementById('rz-result');
  const surEl   = document.getElementById('rz-surcharge');

  if (!input) { resEl.innerHTML = ''; surEl.innerHTML = ''; return; }

  if (country === 'US') {
    const found = (YUN.us_remote_zip || []).find(r => r['우편번호'] === input);
    if (found) {
      const zone = found['구역'];
      resEl.innerHTML = `<div class="rbox rb-o"><div class="rlbl">📍 격오지 해당</div><div class="rval" style="color:var(--ics-orange)">우편번호 <b>${found['우편번호']}</b> (${found['State']}) → <b>${zone}구역</b></div></div>`;
      renderUsSurchargeForZone(zone, surEl);
    } else {
      resEl.innerHTML = `<div class="rbox"><div class="rlbl">✅ 일반 지역</div><div class="rval" style="color:#388e3c">우편번호 <b>${input}</b> 은(는) 격오지에 해당하지 않습니다.</div></div>`;
      surEl.innerHTML = '';
    }
  } else if (country === 'JP') {
    const found = (YUN.jp_remote_zip || []).find(r => r['우편번호'].replace(/-/g,'') === input.replace(/-/g,''));
    if (found) {
      const regionLabel = {'오키나와':'오키나와(Okinawa)','홋카이도':'홋카이도(Hokkaido)','섬지역':'섬지역(Island)'}[found['지역']] || found['지역'];
      resEl.innerHTML = `<div class="rbox rb-o"><div class="rlbl">📍 격오지 해당</div><div class="rval" style="color:var(--ics-orange)">우편번호 <b>${found['우편번호']}</b> → <b>${regionLabel}</b></div></div>`;
    } else {
      resEl.innerHTML = `<div class="rbox"><div class="rlbl">✅ 일반 지역</div><div class="rval" style="color:#388e3c">우편번호 <b>${input}</b> 은(는) 격오지에 해당하지 않습니다.</div></div>`;
    }
    surEl.innerHTML = '';
  } else if (country === 'GB') {
    const data = YUN.gb_remote_zip || [];
    const isRemote = data.some(r => {
      const s = r['시작우편번호'].toUpperCase();
      const e = r['종료우편번호'].toUpperCase();
      // 알파벳 prefix 추출 후 범위 비교
      const prefix = input.replace(/[0-9].*$/, '');
      const numPart = parseInt(input.replace(/^[A-Z]+/, '')) || 0;
      const sPrefix = s.replace(/[0-9].*$/, '');
      const sNum   = parseInt(s.replace(/^[A-Z]+/, '')) || 0;
      const ePrefix = e.replace(/[0-9].*$/, '');
      const eNum   = parseInt(e.replace(/^[A-Z]+/, '')) || 0;
      if (sPrefix !== ePrefix) {
        return prefix === sPrefix || prefix === ePrefix;
      }
      return prefix === sPrefix && numPart >= sNum && numPart <= eNum;
    });
    if (isRemote) {
      resEl.innerHTML = `<div class="rbox rb-o"><div class="rlbl">📍 격오지 해당</div><div class="rval" style="color:var(--ics-orange)">우편번호 <b>${input}</b> 은(는) GB 격오지(Remote Area)에 해당합니다.</div></div>`;
    } else {
      resEl.innerHTML = `<div class="rbox"><div class="rlbl">✅ 일반 지역</div><div class="rval" style="color:#388e3c">우편번호 <b>${input}</b> 은(는) 격오지에 해당하지 않습니다.</div></div>`;
    }
    surEl.innerHTML = '';
  }
}

function renderUsSurchargeForZone(zone, el) {
  const data = YUN.us_remote_surcharge || [];
  if (!data.length) { el.innerHTML = ''; return; }
  const col = '구역' + zone;
  const hasCol = data[0] && col in data[0];
  if (!hasCol) { el.innerHTML = `<div class="alert alert-o">${zone}구역 추가요금 데이터가 없습니다.</div>`; return; }
  let html = `<div style="margin-top:10px"><div style="font-weight:700;font-size:13px;margin-bottom:6px;color:var(--ics-purple)">💰 ${zone}구역 격오지 추가요금 (USD)</div>`;
  html += '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>무게(kg)</th><th>추가요금(USD)</th></tr></thead><tbody>';
  data.forEach(r => {
    html += `<tr><td>${r['무게_kg']}</td><td>${parseFloat(r[col]).toFixed(2)}</td></tr>`;
  });
  html += '</tbody></table></div></div>';
  el.innerHTML = html;
}

function renderRemoteZipTable(country) {
  const el = document.getElementById('rz-table');
  el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400)">불러오는 중...</div>';
  setTimeout(() => {
    let html = '';
    if (country === 'US') {
      const data = YUN.us_remote_zip || [];
      html = '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>우편번호</th><th>State</th><th>구역</th></tr></thead><tbody>';
      data.forEach(r => { html += `<tr><td>${r['우편번호']}</td><td>${r['State']}</td><td>${r['구역']}</td></tr>`; });
      html += `</tbody></table></div><div style="font-size:11px;color:var(--gray-400);margin-top:4px">총 ${data.length}건</div>`;
    } else if (country === 'JP') {
      const data = YUN.jp_remote_zip || [];
      const grouped = {};
      data.forEach(r => { if (!grouped[r['지역']]) grouped[r['지역']] = []; grouped[r['지역']].push(r['우편번호']); });
      html = '';
      ['오키나와','홋카이도','섬지역'].forEach(region => {
        const list = grouped[region] || [];
        html += `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:12px;color:var(--ics-purple);margin-bottom:6px">${region} (${list.length}건)</div>`;
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
        list.forEach(z => { html += `<span style="background:var(--gray-100);border-radius:4px;padding:2px 8px;font-size:11px">${z}</span>`; });
        html += '</div></div>';
      });
    } else if (country === 'GB') {
      const data = YUN.gb_remote_zip || [];
      html = '<table class="data-table"><thead><tr><th>시작 우편번호</th><th>종료 우편번호</th></tr></thead><tbody>';
      data.forEach(r => { html += `<tr><td>${r['시작우편번호']}</td><td>${r['종료우편번호']}</td></tr>`; });
      html += '</tbody></table>';
    }
    el.innerHTML = html;
  }, 30);
}

// ══ IP 조회 사이트 함수 ══

function renderIpSites() {
  const el = document.getElementById('ip-sites-table');
  if (!el) return;
  const data = YUN.ip_sites || [];
  if (!data.length) { el.innerHTML = '<div class="no-result">데이터 로딩 중...</div>'; return; }
  let html = '<table class="data-table"><thead><tr><th>국가</th><th>코드</th><th>조회 사이트</th></tr></thead><tbody>';
  data.forEach(r => {
    html += `<tr><td>${r['국가']}</td><td><b>${r['코드']}</b></td><td><a href="${r['URL']}" target="_blank" rel="noopener noreferrer" style="color:var(--ics-purple);word-break:break-all">${r['URL']}</a></td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ══ YUN FUNCTIONS ══
function searchRate() {
  const w=parseInt(document.getElementById('rw').value), code=document.getElementById('rc').value;
  if(!w||!code){alert('무게와 국가를 입력하세요.');return;}
  const rates = YUN.std_rates.filter(r=>r['국가코드']===code);
  let found=null; for(const r of rates) if(parseInt(r['무게_g'])>=w){found=r;break;}
  if(!found) found=rates[rates.length-1];
  const ci = YUN.countries.find(c=>c['국가코드']===code);
  document.getElementById('r-lbl').textContent = (ci?ci['국가명']:code)+' ('+code+') · 적용구간: '+found['무게_g']+'g';
  document.getElementById('r-val').textContent = found['운임_KRW'] ? '₩ '+parseInt(found['운임_KRW']).toLocaleString() : '서비스 불가';
  document.getElementById('r-sub').textContent = ci?'배송기간: '+ci['배송기간']+' · '+CFG.yun.serviceCodes.priority:'';
  document.getElementById('r-box').style.display='block';
}
function showAllRates() {
  const w=parseInt(document.getElementById('aw').value);
  if(!w){alert('무게를 입력하세요.');return;}
  const tb=document.getElementById('ar-body'); tb.innerHTML='';
  YUN.countries.forEach(c=>{
    const rates=YUN.std_rates.filter(r=>r['국가코드']===c['국가코드']);
    let found=null; for(const r of rates) if(parseInt(r['무게_g'])>=w){found=r;break;}
    if(!found&&rates.length) found=rates[rates.length-1];
    const p=found?found['운임_KRW']:'';
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+c['국가명']+'</td><td>'+c['국가코드']+'</td><td>'+c['배송기간']+'</td><td class="pc">'+(p?'₩ '+parseInt(p).toLocaleString():'서비스 불가')+'</td>';
    tb.appendChild(tr);
  });
  document.getElementById('ar-wrap').style.display='block';
}
function searchUS() {
  const svc=document.getElementById('us-svc').value;
  const wkg=parseFloat(document.getElementById('us-w').value);
  if(!wkg){alert('무게를 입력하세요.');return;}
  const rates=svc==='normal'?YUN.us_normal:YUN.us_cosmetics;
  let found=null; for(const r of rates) if(parseFloat(r['무게_kg'])>=wkg){found=r;break;}
  if(!found) found=rates[rates.length-1];
  document.getElementById('us-rl').textContent='미국 '+(svc==='normal'?'일반('+CFG.yun.serviceCodes.standard+')':'화장품('+CFG.yun.serviceCodes.cosmetics+')')+' · 적용: '+found['무게_kg']+'kg';
  document.getElementById('us-rv').textContent='₩ '+parseInt(found['운임_KRW']).toLocaleString();
  document.getElementById('us-rs').textContent='배송기간: '+CFG.yun.us.leadTime+' · '+CFG.yun.us.leadTimeNote;
  document.getElementById('us-r').style.display='block';
}
function showUSTable() {
  const svc=document.getElementById('us-ts').value;
  const rates=svc==='normal'?YUN.us_normal:YUN.us_cosmetics;
  const tb=document.getElementById('us-tb'); tb.innerHTML='';
  rates.forEach(r=>{const tr=document.createElement('tr');tr.innerHTML='<td>'+r['무게_kg']+' kg</td><td class="pc">₩ '+parseInt(r['운임_KRW']).toLocaleString()+'</td>';tb.appendChild(tr);});
  document.getElementById('us-tw').style.display='block';
}
function searchRemote() {
  const w=parseFloat(document.getElementById('urw').value);
  const zone=document.getElementById('urz').value;
  if(!w){alert('무게를 입력하세요.');return;}
  let found=null; for(const r of YUN.us_remote) if(parseFloat(r['무게_kg'])>=w){found=r;break;}
  if(!found) found=YUN.us_remote[YUN.us_remote.length-1];
  const zoneLabel=zone.replace('_USD','');
  document.getElementById('ur-rv').textContent=found[zone]?'$ '+parseFloat(found[zone]).toFixed(2)+' USD':'N/A';
  document.getElementById('ur-r').style.display='block';
}
function showRemoteTable() {
  const zone=document.getElementById('ur-ts').value;
  const zoneLabel=zone.replace('_USD','');
  const tb=document.getElementById('ur-tb'); tb.innerHTML='';
  YUN.us_remote.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+r['무게_kg']+' kg</td><td style="font-weight:700;color:var(--ics-orange-dk)">$ '+parseFloat(r[zone]).toFixed(2)+'</td>';
    tb.appendChild(tr);
  });
  document.getElementById('ur-tw').style.display='block';
}
function searchItems() {
  const kw=document.getElementById('ik').value.toLowerCase();
  const region=document.getElementById('ir').value;
  const status=document.getElementById('is2').value;
  const tb=document.getElementById('items-body'); tb.innerHTML='';
  let cnt=0;
  YUN.prohibited.forEach(item=>{
    if(kw&&!item['품목'].toLowerCase().includes(kw)&&!item['설명'].toLowerCase().includes(kw)) return;
    if(region!=='all'&&status!=='all'&&item[region]!==status) return;
    cnt++;
    const cells=['SG','EU','JP','MY','AU','RU','TW','US'].map(r=>'<td class="'+(item[r]==='X'?'no':item[r]==='O'?'ok':'')+'">'+item[r]+'</td>').join('');
    const tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600">'+hl(item['품목'],kw)+'</td>'+cells+'<td style="font-size:11.5px">'+hl(item['설명'],kw)+'</td>';
    tb.appendChild(tr);
  });
  if(!cnt) tb.innerHTML='<tr><td colspan="10" class="no-result">검색 결과 없음</td></tr>';
}
function searchBrands() {
  const kw=document.getElementById('bk').value.toLowerCase();
  const tb=document.getElementById('brands-body'); tb.innerHTML='';
  let cnt=0;
  YUN.brands.forEach((b,i)=>{
    if(kw&&!b['브랜드명'].toLowerCase().includes(kw)) return;
    cnt++;
    const tr=document.createElement('tr');
    tr.innerHTML='<td style="color:var(--gray-500)">'+(i+1)+'</td><td style="font-weight:600">'+hl(b['브랜드명'],kw)+'</td><td><span class="badge br2">발송 금지</span></td>';
    tb.appendChild(tr);
  });
  document.getElementById('b-info').textContent=kw?'"'+kw+'" 결과: '+cnt+'개':'전체 '+YUN.brands.length+'개 브랜드';
  if(!cnt) tb.innerHTML='<tr><td colspan="3" class="no-result">검색 결과 없음</td></tr>';
}
function searchVAT() {
  const kw=document.getElementById('vk').value.toLowerCase();
  const tb=document.getElementById('vat-body'); tb.innerHTML='';
  YUN.eu_vat.forEach((v,i)=>{
    if(kw&&!v['국가'].toLowerCase().includes(kw)) return;
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+(i+1)+'</td><td style="font-weight:600">'+hl(v['국가'],kw)+'</td>'
      +'<td><span class="badge bp">'+(v['VAT세율']?(parseFloat(v['VAT세율'])*100).toFixed(0)+'%':'-')+'</span></td>'
      +'<td>'+(v['대납수수료']?(parseFloat(v['대납수수료'])*100).toFixed(0)+'%':'-')+'</td>';
    tb.appendChild(tr);
  });
}
function searchSize() {
  const kw=document.getElementById('sk').value.toLowerCase();
  const tb=document.getElementById('size-body'); tb.innerHTML='';
  let lastSvc='';
  YUN.size_guide.forEach(s=>{
    if(kw&&!s['국가'].toLowerCase().includes(kw)) return;
    const sd=s['서비스']!==lastSvc?'<td style="font-size:10.5px;color:var(--gray-500)">'+s['서비스']+'</td>':'<td></td>';
    lastSvc=s['서비스'];
    const tr=document.createElement('tr');
    tr.innerHTML=sd+'<td style="font-weight:600">'+hl(s['국가'],kw)+'</td><td>'+s['최소사이즈']+'</td><td>'+s['정상발송']+'</td>'
      +'<td style="color:var(--ics-orange-dk);font-weight:600">'+(s['추가30000원']||'-')+'</td>'
      +'<td style="color:var(--danger);font-weight:600">'+(s['추가60000원']||'-')+'</td>';
    tb.appendChild(tr);
  });
}
function searchGuide() {
  const kw=document.getElementById('gk').value.toLowerCase();
  const box=document.getElementById('g-res');
  if(!kw){box.innerHTML='<div class="no-result">검색어를 입력하세요</div>';return;}
  const res=YUN.guide.filter(g=>g['내용'].toLowerCase().includes(kw));
  if(!res.length){box.innerHTML='<div class="no-result">검색 결과 없음</div>';return;}
  box.innerHTML='<div style="font-size:11px;color:var(--gray-500);margin-bottom:7px">'+res.length+'개 항목</div>';
  res.forEach(g=>{
    const d=document.createElement('div');
    const isH=/^[※①②③④≫]/.test(g['내용']);
    d.style.cssText='padding:8px 11px;border-left:3px solid '+(isH?'var(--ics-orange)':'transparent')+';background:'+(isH?'var(--ics-orange-bg)':'')
      +';border-radius:0 5px 5px 0;margin-bottom:3px;font-size:12.5px;line-height:1.65;color:var(--gray-700)';
    d.innerHTML=hl(g['내용'],kw); box.appendChild(d);
  });
}

// ══ EMS FUNCTIONS ══
function renderEMSItems() { searchEMSItems(); }
function searchEMSItems() {
  const kw=document.getElementById('ems-ik').value.toLowerCase();
  const status=document.getElementById('ems-is').value;
  const tb=document.getElementById('ems-items-body'); tb.innerHTML='';
  EMS.sendable_items.forEach(item=>{
    if(kw&&!item['품목'].toLowerCase().includes(kw)&&!(item['조건_및_비고']||'').toLowerCase().includes(kw)) return;
    if(status!=='all'&&item['구분']!==status) return;
    const cls=item['구분']==='가능'?'ok':item['구분']==='불가'?'no':'';
    const badge=item['구분']==='가능'?'<span class="badge bg2">가능</span>':item['구분']==='불가'?'<span class="badge br2">불가</span>':'<span class="badge bo2">확인필요</span>';
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+badge+'</td><td style="font-weight:600">'+hl(item['품목'],kw)+'</td><td style="font-size:11.5px">'+hl(item['조건_및_비고']||'',kw)+'</td>';
    tb.appendChild(tr);
  });
}
function renderTracking() {
  const div=document.getElementById('ems-tracking-cards');
  EMS.tracking.forEach(t=>{
    div.innerHTML+='<div class="card ra"><div class="ctop"><div class="ct ems-ct">'+t['방법']+'</div>'
      +'<span class="badge bems">'+t['청구기한'].substring(0,15)+'...</span></div>'
      +'<div class="igrid">'
      +'<div class="ic"><div class="lb">청구기한</div><div class="vl" style="font-size:11.5px">'+t['청구기한']+'</div></div>'
      +'<div class="ic"><div class="lb">절차</div><div class="vl" style="font-size:11.5px">'+t['절차']+'</div></div>'
      +(t['비고']?'<div class="ic" style="grid-column:1/-1"><div class="lb">비고</div><div class="vl" style="font-size:11.5px">'+t['비고']+'</div></div>':'')
      +'</div></div>';
  });
}
function renderComp() { filterComp(); }
function filterComp() {
  const svc=document.getElementById('comp-svc').value;
  const tb=document.getElementById('comp-body'); tb.innerHTML='';
  EMS.comp_amount.forEach(c=>{
    if(svc!=='all'&&!c['서비스종류'].includes(svc)) return;
    const tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600">'+c['서비스종류']+'</td><td>'+c['손해배상_범위']+'</td><td style="color:var(--ems-red);font-weight:600">'+c['배상금액']+'</td>';
    tb.appendChild(tr);
  });
}
function renderRules() { filterRules(); }
function filterRules() {
  const sec=document.getElementById('rule-sec').value;
  const div=document.getElementById('rules-list'); div.innerHTML='';
  let lastSec='';
  EMS.comp_rules.forEach(r=>{
    if(sec!=='all'&&!r['섹션'].includes(sec)) return;
    if(r['섹션']!==lastSec){
      div.innerHTML+='<div class="sdiv">'+r['섹션']+'</div>';
      lastSec=r['섹션'];
    }
    div.innerHTML+='<div style="padding:8px 12px;border-left:3px solid var(--ems-red);background:var(--ems-red-bg);border-radius:0 6px 6px 0;margin-bottom:4px;font-size:12.5px;line-height:1.65;">'+r['내용']+'</div>';
  });
}
function renderFAQ(svc) {
  const pre = svc === 'sf' ? 'sf-faq' : 'faq';
  const kw = (document.getElementById(pre + '-kw')?.value || '').toLowerCase();
  const cat = document.getElementById(pre + '-cat')?.value || 'all';
  const list = document.getElementById(pre + '-list');
  const data = svc === 'sf' ? SF.faq : EMS.faq;
  if (!list || !data?.length) return;
  const rows = data.filter(r =>
    (cat === 'all' || r['카테고리'] === cat) &&
    (!kw || (r['질문']||'').toLowerCase().includes(kw) || (r['답변']||'').toLowerCase().includes(kw))
  );
  if (!rows.length) { list.innerHTML = '<div class="no-result">검색 결과 없음</div>'; return; }
  const qCls = svc === 'sf' ? 'sf-q' : 'ems-q';
  list.innerHTML = rows.map(r => {
    const hdr = svc === 'sf'
      ? `<span>${hl(r['질문'],kw)}<span class="faq-cat" style="background:rgba(26,26,26,.1);color:var(--sf-black)">${r['카테고리']}</span></span><span>▾</span>`
      : `<span>${hl(r['질문'],kw)}</span><span><span class="badge bems faq-cat">${r['카테고리']}</span> ▾</span>`;
    return `<div class="faq-item"><div class="faq-q ${qCls}" onclick="this.nextElementSibling.classList.toggle('open')">${hdr}</div><div class="faq-a">${hl(r['답변'],kw)}</div></div>`;
  }).join('');
}
function renderCountryCond() { searchCountryCond(); }
function searchCountryCond() {
  const kw=document.getElementById('cc-kw').value.toLowerCase();
  const tb=document.getElementById('cc-body'); tb.innerHTML='';
  EMS.country_cond.forEach(c=>{
    if(kw&&!c['국가'].toLowerCase().includes(kw)) return;
    const tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600">'+hl(c['국가'],kw)+'</td><td style="font-size:11.5px">'+c['주요발송조건']+'</td><td style="color:var(--ems-red);font-weight:600">'+c['면세기준']+'</td><td style="font-size:11.5px">'+c['특이사항']+'</td>';
    tb.appendChild(tr);
  });
}
function renderRegions() {
  const div=document.getElementById('region-list');
  EMS.regions.forEach(r=>{
    div.innerHTML+='<div class="card" style="margin-bottom:8px;padding:12px">'
      +'<div style="font-size:12px;font-weight:700;color:var(--ems-red);margin-bottom:5px">'+r['지역']+'</div>'
      +'<div style="font-size:12px;line-height:1.65;color:var(--gray-700)">'+r['국가목록']+'</div>'
      +(r['비고']?'<div style="font-size:11px;color:var(--gray-500);margin-top:4px">'+r['비고']+'</div>':'')
      +'</div>';
  });
}
function renderContract() {
  const tb=document.getElementById('contract-body');
  EMS.contract.forEach(c=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600;color:var(--ems-red)">'+c['구분'].replace(/_/g,' ')+'</td><td style="font-size:12.5px">'+c['내용']+'</td>';
    tb.appendChild(tr);
  });
}
function searchOverview(svc) {
  const pre = svc === 'sf' ? 'sf' : 'ems';
  const kw = document.getElementById(pre + '-ov-kw').value.toLowerCase();
  const res = document.getElementById(pre + '-ov-res');
  const body = document.getElementById(pre + '-ov-body');
  const data = svc === 'sf' ? SF.service_overview : EMS.service_overview;
  const catStyle = svc === 'sf' ? '' : ' style="font-weight:600;color:var(--ems-red)"';
  if (!kw) { res.style.display = 'none'; return; }
  const rows = data.filter(r =>
    (r['카테고리']||'').toLowerCase().includes(kw) ||
    (r['항목']||'').toLowerCase().includes(kw) ||
    (r['내용']||'').toLowerCase().includes(kw)
  );
  res.style.display = rows.length ? 'block' : 'none';
  body.innerHTML = rows.map(r =>
    `<tr><td${catStyle}>${hl(r['카테고리'],kw)}</td><td style="font-weight:600">${hl(r['항목'],kw)}</td><td style="font-size:12.5px">${hl(r['내용'],kw)}</td></tr>`
  ).join('');
}

function renderInsurance() {
  const box=document.getElementById('ins-all');
  if(!box||!YUN.insurance||!YUN.insurance.length) return;
  box.innerHTML='';
  let isSection=false;
  YUN.insurance.forEach(ins=>{
    const txt=ins['내용']||'';
    const isHead=/^[※①②③④⑤⑥⑦⑧⑨⑩≫]/.test(txt)||txt.length<30;
    if(isHead){
      box.innerHTML+='<div class="sdiv">'+txt+'</div>';
    } else {
      box.innerHTML+='<div style="padding:8px 12px;border-left:3px solid var(--yun-teal);border-radius:0 6px 6px 0;background:var(--gray-50);margin-bottom:4px;font-size:12.5px;line-height:1.65;color:var(--gray-700)">'+txt+'</div>';
    }
  });
}
function searchInsurance() {
  const kw=document.getElementById('ins-kw').value.toLowerCase();
  const box=document.getElementById('ins-res');
  if(!kw){box.innerHTML='<div class="no-result">검색어를 입력하세요</div>';return;}
  if(!YUN.insurance||!YUN.insurance.length){box.innerHTML='<div class="no-result">데이터 로딩 중...</div>';return;}
  const res=YUN.insurance.filter(ins=>(ins['내용']||'').toLowerCase().includes(kw));
  if(!res.length){box.innerHTML='<div class="no-result">검색 결과 없음</div>';return;}
  box.innerHTML='<div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">'+res.length+'개 항목</div>';
  res.forEach(ins=>{
    box.innerHTML+='<div style="padding:8px 11px;border-left:3px solid var(--yun-teal);border-radius:0 5px 5px 0;background:var(--yun-teal-bg);margin-bottom:3px;font-size:12.5px;line-height:1.65;color:var(--gray-700)">'+hl(ins['내용'],kw)+'</div>';
  });
}

// ══════════════════════════════════════
// SF Express 렌더링 함수
// ══════════════════════════════════════

function renderSFLeadTime() {
  const body = document.getElementById('sf-lt-body');
  if(!SF.lead_time||!body) return;
  body.innerHTML = SF.lead_time.map(r => {
    const bg = r['거점'].includes('HK') ? 'background:rgba(26,26,26,.04)' : '';
    return `<tr style="${bg}">
      <td><strong>${r['거점']}</strong></td>
      <td>${r['지역구분']}</td>
      <td>${r['출발요일']}</td>
      <td><span class="badge" style="background:rgba(26,26,26,.1);color:var(--sf-black)">${r['리드타임']}</span></td>
      <td style="font-size:11.5px;color:var(--gray-500)">${r['비고']||''}</td>
    </tr>`;
  }).join('');
}

function searchSFItems() {
  const kw = (document.getElementById('sf-item-kw').value||'').toLowerCase();
  const type = document.getElementById('sf-item-type').value;
  const body = document.getElementById('sf-items-body');
  if(!SF.prohibited||!body) return;
  const rows = SF.prohibited.filter(r =>
    (type==='all'||r['구분']===type) &&
    (!kw||(r['품목']||'').toLowerCase().includes(kw)||(r['조건_및_비고']||'').toLowerCase().includes(kw))
  );
  const colorMap = {'절대 금지':'color:var(--danger);font-weight:800','조건부 가능':'color:var(--success);font-weight:700','주의 품목':'color:var(--ics-orange-dk);font-weight:700','주의 사항':'color:var(--gray-700)'};
  body.innerHTML = rows.length ? rows.map(r =>
    `<tr><td><span style="${colorMap[r['구분']]||''}">${r['구분']}</span></td><td>${hl(r['품목'],kw)}</td><td style="font-size:12px">${hl(r['조건_및_비고']||'',kw)}</td></tr>`
  ).join('') : `<tr><td colspan="3" class="no-result">검색 결과 없음</td></tr>`;
}

function renderSFItems() { searchSFItems(); }

function renderSFCustoms() {
  const body = document.getElementById('sf-customs-body');
  if(!SF.customs||!body) return;
  body.innerHTML = SF.customs.map(r =>
    `<tr><td><strong>${r['섹션']}</strong></td><td>${r['항목']}</td><td>${r['내용']}</td><td style="font-size:11.5px;color:var(--gray-500)">${r['비고']||''}</td></tr>`
  ).join('');
}

function renderSFDelivery() {
  const body = document.getElementById('sf-delivery-body');
  if(!SF.delivery||!body) return;
  body.innerHTML = SF.delivery.map(r =>
    `<tr><td><strong>${r['구분']}</strong></td><td>${r['항목']}</td><td style="font-size:12.5px">${r['내용']}</td></tr>`
  ).join('');
}

function searchSFComp() {
  const kw = (document.getElementById('sf-comp-kw').value||'').toLowerCase();
  const body = document.getElementById('sf-comp-body');
  if(!SF.compensation||!body) return;
  const rows = !kw ? SF.compensation : SF.compensation.filter(r=>
    (r['섹션']||'').toLowerCase().includes(kw)||
    (r['항목']||'').toLowerCase().includes(kw)||
    (r['내용']||'').toLowerCase().includes(kw)
  );
  body.innerHTML = rows.length ? rows.map(r =>
    `<tr><td><strong>${hl(r['섹션'],kw)}</strong></td><td>${hl(r['항목'],kw)}</td><td style="font-size:12.5px">${hl(r['내용'],kw)}</td></tr>`
  ).join('') : `<tr><td colspan="3" class="no-result">검색 결과 없음</td></tr>`;
}

function renderSFComp() { searchSFComp(); }

function globalSearch(svc) {
  const kw=document.getElementById(svc+'-gs').value.toLowerCase();
  const box=document.getElementById(svc+'-gs-result');
  if(!kw||kw.length<2){box.innerHTML='';return;}
  const results=[];
  if(svc==='yun'){
    YUN.guide.forEach(g=>{if(g['내용'].toLowerCase().includes(kw)) results.push({type:'가이드',text:g['내용']});});
    YUN.prohibited.forEach(p=>{if(p['품목'].toLowerCase().includes(kw)||p['설명'].toLowerCase().includes(kw)) results.push({type:'발송제한',text:p['품목']+': '+p['설명']});});
    YUN.brands.forEach(b=>{if(b['브랜드명'].toLowerCase().includes(kw)) results.push({type:'브랜드',text:b['브랜드명']+' - 발송금지'});});
    YUN.eu_vat.forEach(v=>{if(v['국가'].toLowerCase().includes(kw)) results.push({type:'EU VAT',text:v['국가']+' VAT '+(parseFloat(v['VAT세율'])*100).toFixed(0)+'%'});});
    YUN.size_guide.forEach(s=>{if(s['국가'].toLowerCase().includes(kw)) results.push({type:'사이즈',text:s['국가']+' 정상: '+s['정상발송']});});
    YUN.countries.forEach(c=>{if(c['국가명'].toLowerCase().includes(kw)||c['국가코드'].toLowerCase().includes(kw)) results.push({type:'국가',text:c['국가명']+'('+c['국가코드']+') 배송기간: '+c['배송기간']});});
    YUN.insurance.forEach(ins=>{if(ins['내용'].toLowerCase().includes(kw)) results.push({type:'보험',text:ins['내용']});});
  } else if(svc==='sf'){
    SF.service_overview.forEach(o=>{if((o['항목']||'').toLowerCase().includes(kw)||(o['내용']||'').toLowerCase().includes(kw)) results.push({type:'서비스',text:o['항목']+': '+o['내용']});});
    SF.lead_time.forEach(l=>{if((l['거점']||'').toLowerCase().includes(kw)||(l['지역구분']||'').toLowerCase().includes(kw)||(l['리드타임']||'').toLowerCase().includes(kw)) results.push({type:'리드타임',text:l['거점']+' '+l['지역구분']+': '+l['리드타임']});});
    SF.prohibited.forEach(p=>{if((p['품목']||'').toLowerCase().includes(kw)||(p['조건_및_비고']||'').toLowerCase().includes(kw)) results.push({type:p['구분'],text:p['품목']+': '+(p['조건_및_비고']||'')});});
    SF.customs.forEach(c=>{if((c['항목']||'').toLowerCase().includes(kw)||(c['내용']||'').toLowerCase().includes(kw)) results.push({type:'통관',text:c['항목']+': '+c['내용']});});
    SF.delivery.forEach(d=>{if((d['항목']||'').toLowerCase().includes(kw)||(d['내용']||'').toLowerCase().includes(kw)) results.push({type:'배달',text:d['항목']+': '+d['내용']});});
    SF.compensation.forEach(c=>{if((c['항목']||'').toLowerCase().includes(kw)||(c['내용']||'').toLowerCase().includes(kw)) results.push({type:'배상',text:c['항목']+': '+c['내용']});});
    SF.faq.forEach(q=>{if((q['질문']||'').toLowerCase().includes(kw)||(q['답변']||'').toLowerCase().includes(kw)) results.push({type:'FAQ',text:q['질문']+'\n'+q['답변'].substring(0,80)+'...'});});
  } else {
    EMS.faq.forEach(q=>{if(q['질문'].toLowerCase().includes(kw)||q['답변'].toLowerCase().includes(kw)) results.push({type:'FAQ',text:q['질문']+'\n'+q['답변'].substring(0,80)+'...'});});
    EMS.sendable_items.forEach(i=>{if(i['품목'].toLowerCase().includes(kw)||(i['조건_및_비고']||'').toLowerCase().includes(kw)) results.push({type:i['구분'],text:i['품목']+': '+(i['조건_및_비고']||'')});});
    EMS.comp_amount.forEach(c=>{if(c['손해배상_범위'].toLowerCase().includes(kw)||c['배상금액'].toLowerCase().includes(kw)) results.push({type:'손해배상',text:c['서비스종류']+' - '+c['손해배상_범위']+': '+c['배상금액']});});
    EMS.comp_rules.forEach(r=>{if(r['내용'].toLowerCase().includes(kw)) results.push({type:'배상규정',text:r['내용']});});
    EMS.service_overview.forEach(o=>{if(o['내용'].toLowerCase().includes(kw)||o['항목'].toLowerCase().includes(kw)) results.push({type:'서비스',text:o['항목']+': '+o['내용']});});
    EMS.tracking.forEach(t=>{if(t['방법'].toLowerCase().includes(kw)||t['절차'].toLowerCase().includes(kw)||t['비고'].toLowerCase().includes(kw)) results.push({type:'행방조사',text:t['방법']+': '+t['절차']});});
    EMS.country_cond.forEach(c=>{if(c['국가'].toLowerCase().includes(kw)) results.push({type:'국가조건',text:c['국가']+' 면세: '+c['면세기준']});});
    EMS.regions.forEach(r=>{if(r['국가목록'].toLowerCase().includes(kw)) results.push({type:'지역구분',text:r['지역']+': '+r['국가목록'].substring(0,60)+'...'});});
  }
  if(!results.length){box.innerHTML='<div class="no-result">검색 결과가 없습니다.</div>';return;}
  box.innerHTML='<div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">'+results.length+'개 항목 발견</div>';
  results.slice(0,50).forEach(r=>{
    const lbCls=svc==='ems'?'lb-ems-faq':svc==='sf'?'lb-rule':'lb-faq';
    const itemCls=svc==='ems'?'gs-item ems-item':svc==='sf'?'gs-item sf-item':'gs-item';
    box.innerHTML+='<div class="'+itemCls+'" onclick="void(0)"><span class="gs-label '+lbCls+'">'+r.type+'</span> '+r.text.replace(/\n/g,'<br>')+'</div>';
  });
}

// ── EMS 국가별 발송조건 (우체국 실시간 조회) ──
const EMS_COUNTRIES = [
  {c:'JP',n:'일본'},{c:'HK',n:'홍콩(중국)'},{c:'CN',n:'중국'},{c:'AU',n:'오스트레일리아(호주)'},
  {c:'US',n:'미국'},{c:'SG',n:'싱가포르'},{c:'GB',n:'영국'},{c:'FR',n:'프랑스'},
  {c:'ES',n:'스페인(에스파니아)'},{c:'GR',n:'그리스'},{c:'NG',n:'나이지리아'},
  {c:'NL',n:'네덜란드(네델란드)'},{c:'NP',n:'네팔'},{c:'NO',n:'노르웨이'},
  {c:'NZ',n:'뉴질랜드'},{c:'DK',n:'덴마크'},{c:'DO',n:'도미니카공화국'},
  {c:'DE',n:'독일'},{c:'LA',n:'라오스'},{c:'LV',n:'라트비아'},{c:'RU',n:'러시아'},
  {c:'RO',n:'루마니아'},{c:'LU',n:'룩셈부르크'},{c:'RW',n:'르완다'},
  {c:'LT',n:'리투아니아'},{c:'MO',n:'마카오(중국)'},{c:'MY',n:'말레이시아'},
  {c:'MX',n:'멕시코'},{c:'MA',n:'모로코'},{c:'MU',n:'모리셔스'},
  {c:'MZ',n:'모잠비크'},{c:'MD',n:'몰도바'},{c:'MV',n:'몰디브'},
  {c:'MN',n:'몽골'},{c:'MM',n:'미얀마'},{c:'BH',n:'바레인'},
  {c:'BD',n:'방글라데시'},{c:'VN',n:'베트남'},{c:'BE',n:'벨기에'},
  {c:'BY',n:'벨라루스'},{c:'BA',n:'보스니아헤르체코비나'},{c:'BW',n:'보츠와나'},
  {c:'BT',n:'부탄'},{c:'MK',n:'북마케도니아'},{c:'BG',n:'불가리아'},
  {c:'BR',n:'브라질'},{c:'BN',n:'브루네이(브루나이)'},{c:'SA',n:'사우디아라비아'},
  {c:'CY',n:'사이프러스'},{c:'LK',n:'스리랑카'},{c:'SE',n:'스웨덴'},
  {c:'CH',n:'스위스'},{c:'SK',n:'슬로바키아'},{c:'SI',n:'슬로베니아'},
  {c:'AE',n:'아랍에미리트연합국'},{c:'AM',n:'아르메니아'},{c:'AR',n:'아르헨티나'},
  {c:'IE',n:'아일랜드'},{c:'AZ',n:'아제르바이잔'},{c:'AL',n:'알바니아'},
  {c:'DZ',n:'알제리'},{c:'EE',n:'에스토니아'},{c:'EC',n:'에콰도르'},
  {c:'ET',n:'에티오피아'},{c:'OM',n:'오만'},{c:'AT',n:'오스트리아'},
  {c:'JO',n:'요르단'},{c:'UZ',n:'우즈베키스탄'},{c:'UA',n:'우크라이나'},
  {c:'IR',n:'이란'},{c:'IL',n:'이스라엘'},{c:'EG',n:'이집트'},
  {c:'IN',n:'인도'},{c:'ID',n:'인도네시아'},{c:'ZM',n:'잠비아'},
  {c:'GE',n:'조지아'},{c:'DJ',n:'지부티'},{c:'CZ',n:'체코'},
  {c:'CL',n:'칠레'},{c:'CV',n:'카보베르데'},{c:'KZ',n:'카자흐스탄'},
  {c:'QA',n:'카타르'},{c:'KH',n:'캄보디아'},{c:'CA',n:'캐나다'},
  {c:'KE',n:'케냐'},{c:'CR',n:'코스타리카'},{c:'CU',n:'쿠바'},
  {c:'CW',n:'퀴라소'},{c:'HR',n:'크로아티아'},{c:'TH',n:'타이(태국)'},
  {c:'TW',n:'타이완(대만)'},{c:'TZ',n:'탄자니아'},{c:'TN',n:'튀니지'},
  {c:'TR',n:'튀르키예'},{c:'PA',n:'파나마'},{c:'PK',n:'파키스탄'},
  {c:'PE',n:'페루'},{c:'PT',n:'포르투갈'},{c:'PL',n:'폴란드'},
  {c:'FJ',n:'피지'},{c:'FI',n:'핀란드'},{c:'PH',n:'필리핀'},{c:'HU',n:'헝가리'}
];

function buildEmsCountryOptions(list) {
  const sel = document.getElementById('epost-nation-select');
  if(!sel) return;
  sel.innerHTML = '<option value="-">— 도착국 선택 (' + list.length + '개국) —</option>';
  list.forEach(c => {
    const o = document.createElement('option');
    o.value = c.c; o.textContent = c.n + ' (' + c.c + ')';
    sel.appendChild(o);
  });
}

function filterEmsCountries(val) {
  const v = val.trim().toLowerCase();
  if(!v) { buildEmsCountryOptions(EMS_COUNTRIES); return; }
  const exact  = EMS_COUNTRIES.filter(c => c.n.toLowerCase() === v || c.c.toLowerCase() === v);
  const starts = EMS_COUNTRIES.filter(c => (c.n.toLowerCase().startsWith(v) || c.c.toLowerCase().startsWith(v)) && !exact.includes(c));
  const rest   = EMS_COUNTRIES.filter(c => (c.n.toLowerCase().includes(v) || c.c.toLowerCase().includes(v)) && !exact.includes(c) && !starts.includes(c));
  const list = [...exact, ...starts, ...rest];
  buildEmsCountryOptions(list);
  const sel = document.getElementById('epost-nation-select');
  if(sel && list.length > 0) sel.value = list[0].c;
}

function submitEmsCountryForm() {
  const sel = document.getElementById('epost-nation-select');
  if(!sel || sel.value === '-') { alert('도착국을 선택하세요.'); return; }
  document.getElementById('epost-country-placeholder').style.display = 'none';
  document.getElementById('epost-country-result').style.display = 'block';
  document.getElementById('epost-country-form').submit();
}
