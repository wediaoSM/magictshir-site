// js/frontend-products.js
// Modular Firebase v9 imports (ES modules)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* =================== FIREBASE CONFIG - COLE AQUI (já preenchido) =================== */
const firebaseConfig = {
  apiKey: "AIzaSyCsHNIvR9RoNuJPHEu0m4ROjxfo_IMLl98",
  authDomain: "meu-ecomerce-92a95.firebaseapp.com",
  projectId: "meu-ecomerce-92a95",
  storageBucket: "meu-ecomerce-92a95.firebasestorage.app",
  messagingSenderId: "50343590801",
  appId: "1:50343590801:web:fbd6da4c78db72b8533830",
  measurementId: "G-S95ECR6L8Z"
};
/* ================================================================================ */

let app;
try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.info('MT Firebase: app inicializado:', app.options?.projectId || '(sem projectId)');
  } else {
    app = getApp();
    console.info('MT Firebase: app já inicializado:', app.options?.projectId || '(sem projectId)');
  }
} catch (e) {
  console.error('MT Firebase init error:', e);
}

const db = getFirestore(app);

/* ------------------ helpers ------------------ */
function formatBRL(cents) {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ------------------ card creation ------------------ */
function createProductCardElement(id, data) {
  const el = document.createElement('article');
  el.className = 'card product-card';
  el.setAttribute('data-id', id);
  el.setAttribute('data-name', data.name || 'Produto');
  el.setAttribute('data-price', data.price_cents || 0);

  // safe image fallback
  const img = escapeHtml(data.image_url || 'https://via.placeholder.com/600x400?text=sem+imagem');

  el.innerHTML = `
    <div class="card-media"><img src="${img}" alt="${escapeHtml(data.name || 'Produto')}"></div>
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(data.name || 'Produto')}</h3>
      <p class="card-sub muted">${escapeHtml(data.description || '')}</p>
      <div class="price">${formatBRL(data.price_cents || 0)}</div>
      <div class="card-actions">
        <button class="btn btn-primary btn-add">Adicionar ao carrinho</button>
        <a class="btn btn-ghost" href="#">Detalhes</a>
      </div>
    </div>
  `;
  return el;
}

/* ------------------ query utilities ------------------ */
/*
  loadProductsInto(containerId, value = null, { field = 'category', limit: n })
  - field: 'category' (default) or 'placement'
  - containerId: id string OR DOM element
*/
export async function loadProductsInto(containerId, value = null, opts = {}) {
  const { field = 'category', limit: lim = 200 } = opts;
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) {
    console.warn('loadProductsInto: container not found ->', containerId);
    return;
  }
  container.innerHTML = ''; // clear previous content / static fallback

  try {
    let qRef;
    if (value) {
      // where + orderBy createdAt desc
      qRef = query(collection(db, 'products'), where(field, '==', value), orderBy('createdAt', 'desc'), limit(lim));
    } else {
      qRef = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(lim));
    }

    const snap = await getDocs(qRef);
    if (snap.empty) {
      container.innerHTML = '<p class="muted">Nenhum produto encontrado.</p>';
      console.info(`MT: nenhum produto retornado (filtro ${field}=${value})`);
      return;
    }

    snap.forEach(doc => {
      const data = doc.data();
      const el = createProductCardElement(doc.id, data);
      container.appendChild(el);
    });
    console.info(`MT: carregados ${snap.size} produtos em "${containerId}" (filtro ${field}=${value})`);
  } catch (err) {
    console.error('MT: Erro ao carregar produtos:', err);
    let hint = '';
    const msg = String(err || '');
    if (msg.includes('Missing or insufficient permissions')) {
      hint = ' — Regras do Firestore estão bloqueando a leitura. Ajuste rules ou autentique o usuário.';
    } else if (msg.includes('requires an index')) {
      hint = ' — Query requer índice composto (vá ao Firebase Console para criar).';
    }
    container.innerHTML = `<p class="muted">Erro ao carregar produtos. Veja console para detalhes.${hint}</p>`;
  }
}

/* ------------------ convenience loader by placement ------------------ */
export async function loadProductsByPlacement(containerId, placementValue, opts = {}) {
  return loadProductsInto(containerId, placementValue, Object.assign({ field: 'placement' }, opts));
}

/* ------------------ HERO renderer ------------------ */
/*
  renderHero(selector, { limit = 4 })
  - selector: CSS selector string or DOM element that will receive the hero slides
  - queries for documents where placement == 'hero' AND featured == true
*/
export async function renderHero(selector, options = {}) {
  const { limit: lim = 4 } = options;
  const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!container) {
    console.warn('renderHero: container não encontrado ->', selector);
    return;
  }

  try {
    const qRef = query(
      collection(db, 'products'),
      where('placement', '==', 'hero'),
      where('featured', '==', true),
      orderBy('createdAt', 'desc'),
      limit(lim)
    );

    const snap = await getDocs(qRef);
    const slides = [];
    snap.forEach(doc => slides.push(Object.assign({ id: doc.id }, doc.data())));

    if (slides.length === 0) {
      container.innerHTML = '<div class="hero-fallback" style="padding:28px;text-align:center;color:#ddd">Nenhum destaque no momento</div>';
      console.info('MT: renderHero - nenhum slide encontrado');
      return;
    }

    // remove qualquer conteúdo estático e constrói slides dinâmicos
    container.innerHTML = '';

    const slidesWrap = document.createElement('div');
    slidesWrap.className = 'hero-slides';
    slidesWrap.style.position = 'relative';
    slidesWrap.style.overflow = 'hidden';

    slides.forEach((p, i) => {
      const slide = document.createElement('div');
      slide.className = 'hero-slide';
      slide.dataset.index = String(i);

      const bg = p.image_url ? `linear-gradient(180deg, rgba(0,0,0,0.28), rgba(0,0,0,0.12)), url('${escapeHtml(p.image_url)}')` : '';
      slide.setAttribute('style', `background-image: ${bg}; display: ${i === 0 ? 'flex' : 'none'}; background-size:cover; background-position:center; min-height:380px; align-items:center;`);

      slide.innerHTML = `
        <div class="container hero-rotator-inner" style="padding:48px 0; display:flex;justify-content:space-between;align-items:center">
          <div class="hero-text" style="max-width:640px">
            <h1 style="margin:0;font-size:36px">${escapeHtml(p.name || '')}</h1>
            <p class="lead" style="margin-top:10px;color:rgba(255,255,255,0.95)">${escapeHtml(p.description || '')}</p>
            <div class="hero-actions" style="margin-top:12px">
              <a class="btn btn-primary" href="#">Ver produto</a>
            </div>
          </div>
          <div class="hero-badge" style="background:rgba(0,0,0,0.45);padding:8px 12px;border-radius:999px;color:#ffd166;font-weight:800">
            ${formatBRL(p.price_cents || 0)}
          </div>
        </div>
      `;

      slidesWrap.appendChild(slide);
    });

    // controls
    const ctrls = document.createElement('div');
    ctrls.className = 'hero-controls';
    ctrls.style.display = 'flex';
    ctrls.style.justifyContent = 'center';
    ctrls.style.gap = '12px';
    ctrls.style.marginTop = '12px';

    const prev = document.createElement('button'); prev.className = 'icon-btn'; prev.textContent = '◀';
    const dots = document.createElement('div'); dots.className = 'hero-dots'; dots.style.display = 'flex'; dots.style.gap = '8px';
    const next = document.createElement('button'); next.className = 'icon-btn'; next.textContent = '▶';

    slides.forEach((_, i) => {
      const b = document.createElement('button');
      b.dataset.i = i;
      b.style.width = '10px'; b.style.height = '10px'; b.style.borderRadius = '999px'; b.style.border = '0';
      b.style.background = i === 0 ? '#7c5cff' : 'rgba(255,255,255,0.12)';
      dots.appendChild(b);
    });

    ctrls.appendChild(prev); ctrls.appendChild(dots); ctrls.appendChild(next);

    container.appendChild(slidesWrap);
    container.appendChild(ctrls);

    // rotator logic
    let idx = 0;
    function show(i) {
      idx = (i + slides.length) % slides.length;
      Array.from(slidesWrap.children).forEach((s, j) => {
        s.style.display = j === idx ? 'flex' : 'none';
      });
      Array.from(dots.children).forEach((d, j) => {
        d.style.background = j === idx ? '#7c5cff' : 'rgba(255,255,255,0.12)';
      });
    }

    dots.addEventListener('click', e => {
      const i = Number(e.target.dataset.i);
      if (Number.isFinite(i)) show(i);
    });
    prev.addEventListener('click', () => show(idx - 1));
    next.addEventListener('click', () => show(idx + 1));

    let auto = setInterval(() => show(idx + 1), 6000);
    container.addEventListener('mouseenter', () => clearInterval(auto));
    container.addEventListener('mouseleave', () => auto = setInterval(() => show(idx + 1), 6000));

    // expose for debug
    container._mtSlides = slides;
    console.info('MT hero slides:', slides.length);
  } catch (err) {
    console.error('MT frontend renderHero error:', err);
    container.innerHTML = '<div style="padding:18px;color:#ddd">Erro ao carregar destaques</div>';
  }
}

/* ------------------ Expose global helpers (compat) ------------------ */
window.MagicLoadProducts = {
  loadProductsInto,
  loadProductsByPlacement,
  renderHero
};
