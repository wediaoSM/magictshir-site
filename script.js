/* script.js - MagicTShirt UI
   contém: helpers, modals, drawer, auth (localStorage), cart + toast, hero rotator, lazyload, misc
*/

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- helpers ---------- */
  function safeClosest(startNode, selector) {
    var node = startNode;
    while (node && node.nodeType !== 1) { node = node.parentNode; }
    return node ? node.closest(selector) : null;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function(m){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
  }

  /* ---------- Modals (open/close + focus trap basic) ---------- */
  function openModal(modal, triggerEl) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    modal._lastFocus = triggerEl || document.activeElement;
    document.body.classList.add('no-scroll');
    setTimeout(function(){
      var focusable = modal.querySelector('input, button, a, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus();
    }, 80);
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    try {
      var last = modal._lastFocus;
      if (last && typeof last.focus === 'function') last.focus();
    } catch(e){}
  }

  /* ---------- Drawer (mobile) ---------- */
  (function(){
    var btnOpen = document.getElementById('btnOpenMenu');
    var btnClose = document.getElementById('btnCloseMenu');
    var drawer = document.getElementById('drawer');
    var scrim = document.getElementById('scrim');

    function openDrawer(){
      if(!drawer) return;
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden','false');
      scrim && scrim.classList.add('show');
      scrim && scrim.setAttribute('aria-hidden','false');
      if (btnOpen) btnOpen.setAttribute('aria-expanded','true');
      setTimeout(function(){
        var f = drawer.querySelector('a, button');
        if (f) f.focus();
      }, 160);
      document.body.classList.add('no-scroll');
    }
    function closeDrawer(){
      if(!drawer) return;
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden','true');
      scrim && scrim.classList.remove('show');
      scrim && scrim.setAttribute('aria-hidden','true');
      if (btnOpen) btnOpen.setAttribute('aria-expanded','false');
      document.body.classList.remove('no-scroll');
      if (btnOpen) btnOpen.focus();
    }

    btnOpen && btnOpen.addEventListener('click', openDrawer);
    btnClose && btnClose.addEventListener('click', closeDrawer);
    scrim && scrim.addEventListener('click', function(){
      if (drawer && drawer.classList.contains('open')) closeDrawer();
      var openModalEl = document.querySelector('.modal[aria-hidden="false"]');
      if (openModalEl) closeModal(openModalEl);
    });

    window.addEventListener('keydown', function(e){
      if (e.key === 'Escape') {
        closeDrawer();
        document.querySelectorAll('.modal[aria-hidden="false"]').forEach(closeModal);
      }
    });
  })();

  /* ---------- Simple Auth (localStorage) ---------- */
  var Auth = (function(){
    var USERS_KEY = 'mt_users_v1';
    var CURR_KEY = 'mt_curr_user_v1';

    function _readUsers(){ try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch(e){ return []; } }
    function _writeUsers(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

    function saveUser(user){ var users = _readUsers(); users.push(user); _writeUsers(users); }
    function findUserByEmail(email){ return _readUsers().find(function(u){ return u.email === email; }); }
    function setCurrent(user){ localStorage.setItem(CURR_KEY, JSON.stringify(user)); }
    function getCurrent(){ try { return JSON.parse(localStorage.getItem(CURR_KEY) || 'null'); } catch(e){ return null; } }
    function clearCurrent(){ localStorage.removeItem(CURR_KEY); }

    return {
      register: function(user){
        if (!user.email || !user.password) return {ok:false,msg:'Preencha e-mail e senha.'};
        if (findUserByEmail(user.email)) return {ok:false,msg:'E-mail já cadastrado.'};
        saveUser(user);
        setCurrent({name:user.name,email:user.email,phone:user.phone});
        return {ok:true};
      },
      login: function(email,password){
        var u = findUserByEmail(email);
        if (!u) return {ok:false,msg:'Usuário não encontrado.'};
        if (u.password !== password) return {ok:false,msg:'Senha incorreta.'};
        setCurrent({name:u.name,email:u.email,phone:u.phone});
        return {ok:true};
      },
      logout: function(){ clearCurrent(); },
      current: function(){ return getCurrent(); }
    };
  })();

  /* ---------- Floating toast (cria e mostra perto do botão clicado) ---------- */
  function showFloatingToast(targetButton, productName, qty) {
    if (!targetButton) return;
    var toast = document.getElementById('floatingToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'floatingToast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    var label = 'Adicionado';
    var nameHtml = '<strong>' + escapeHtml(productName) + '</strong>';
    var qtyText = (qty && qty>1) ? (' • ' + qty + 'x') : '';
    toast.innerHTML = '<span class="toast-icon">✔️</span><span>' + label + ': ' + nameHtml + qtyText + '</span>';

    var rect = targetButton.getBoundingClientRect();
    var left = rect.left + rect.width / 2;
    var top = rect.top - 12;
    if (top < 60) top = rect.bottom + 12;
    var docW = document.documentElement.clientWidth || window.innerWidth;
    left = Math.max(80, Math.min(docW - 80, left));

    toast.style.left = left + 'px';
    toast.style.top = top + 'px';
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');

    if (toast._timeout) clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function(){
      toast.classList.remove('show');
    }, 2200);
  }

  /* ---------- CART MODULE (fechar ao clicar fora do modal) ---------- */
var CartModule = (function(){
  var cart = []; // array de {id,name,priceCents,qty,image}
  var btnCart = document.getElementById('btnCart');
  var cartModal = document.getElementById('cartModal');
  var btnCloseCart = document.getElementById('btnCloseCart');
  var cartBackdrop = document.getElementById('cartModalBackdrop');
  var cartListEl = document.getElementById('cartList'); // agora lista
  var cartCount = document.getElementById('cartCount');
  var cartSubtotalEl = document.getElementById('cartSubtotal');
  var cartTotalEl = document.getElementById('cartTotal');
  var btnCheckout = document.getElementById('btnCheckout');
  var fab = document.getElementById('fabViewCart');
  var btnClearCart = document.getElementById('btnClearCart');
  var btnContinueShopping = document.getElementById('btnContinueShopping');

  function formatBRL(cents){ return (Number(cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

  function recalcTotals(){
    var totalQty = cart.reduce(function(s,i){ return s + (i.qty||0); },0);
    var subtotal = cart.reduce(function(s,i){ return s + (i.priceCents||0) * (i.qty||0); },0);
    return { totalQty: totalQty, subtotal: subtotal, totalCents: subtotal /* ajuste se tiver frete/cupons */ };
  }

  function updateCartUI(){
    if (!cartCount || !cartListEl || !cartSubtotalEl || !cartTotalEl) return;
    var totals = recalcTotals();
    cartCount.textContent = String(totals.totalQty);
    cartSubtotalEl.textContent = formatBRL(totals.subtotal);
    cartTotalEl.textContent = formatBRL(totals.totalCents);

    // FAB show/hide
    if (fab) {
      if (totals.totalQty >= 1) { fab.classList.add('show'); fab.setAttribute('aria-hidden','false'); }
      else { fab.classList.remove('show'); fab.setAttribute('aria-hidden','true'); }
    }

    // render items
    cartListEl.innerHTML = '';
    if (cart.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-cart';
      empty.innerHTML = '<div class="emoji">🛍️</div><div><strong>Carrinho vazio</strong></div><div class="muted">Adicione produtos para começar.</div>';
      cartListEl.appendChild(empty);
      return;
    }

    cart.forEach(function(it, idx){
      var item = document.createElement('div');
      item.className = 'cart-item enter';
      item.setAttribute('data-i', idx);

      var thumb = document.createElement('div');
      thumb.className = 'cart-item-thumb';
      thumb.innerHTML = it.image ? '<img src="'+ it.image +'" alt="'+ escapeHtml(it.name) +'">' : '';

      var body = document.createElement('div');
      body.className = 'cart-item-body';
      body.innerHTML = '<div class="name">'+ escapeHtml(it.name) +'</div>'
                     + '<div class="meta muted">R$ ' + ((it.priceCents/100).toFixed(2)).replace('.',',') +'</div>';

      var right = document.createElement('div');
      right.className = 'cart-item-right';
      right.innerHTML =
        '<div class="qty-controls" role="group" aria-label="Quantidade do item">'
          + '<button data-i="'+idx+'" data-action="dec" class="qty-btn" title="Diminuir">-</button>'
          + '<div class="qty">'+ (it.qty||1) +'</div>'
          + '<button data-i="'+idx+'" data-action="inc" class="qty-btn" title="Aumentar">+</button>'
        + '</div>'
        + '<button data-i="'+idx+'" data-action="rem" class="cart-remove" title="Remover item">✕</button>';

      item.appendChild(thumb);
      item.appendChild(body);
      item.appendChild(right);
      cartListEl.appendChild(item);

      // small subtle animation removal after appear
      setTimeout(function(){ item.classList.remove('enter'); }, 380);
    });
  }

  function openCart(){ if (!cartModal) return; updateCartUI(); openModal(cartModal); if (btnCart) btnCart.setAttribute('aria-expanded','true'); }
  function closeCart(){ if (!cartModal) return; closeModal(cartModal); if (btnCart) btnCart.setAttribute('aria-expanded','false'); }

  // events
  btnCart && btnCart.addEventListener('click', function(e){ openCart(); });
  fab && fab.addEventListener('click', function(){ openCart(); });
  btnCloseCart && btnCloseCart.addEventListener('click', closeCart);

  // Fecha com Esc (já existia, mas reforço local)
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeCart(); });

  // Fecha ao clicar no backdrop específico do cart
  cartBackdrop && cartBackdrop.addEventListener('click', function(){ closeCart(); });

  // Também fecha se o usuário clicar diretamente na área do modal fora da caixa (.modal-box)
  cartModal && cartModal.addEventListener('click', function(e){
    // se o target do clique for o próprio container do modal (ou o backdrop), fecha
    if (e.target === cartModal || e.target === cartBackdrop) {
      closeCart();
    }
  });

  btnCheckout && btnCheckout.addEventListener('click', function(){
    alert('Checkout: você tem ' + cart.reduce(function(s,i){ return s + (i.qty||0); },0) + ' itens no carrinho.');
  });

  btnClearCart && btnClearCart.addEventListener('click', function(){
    if (!confirm('Deseja limpar o carrinho?')) return;
    cart = [];
    updateCartUI();
  });

  btnContinueShopping && btnContinueShopping.addEventListener('click', function(){
    closeCart();
    window.scrollTo({top:0,behavior:'smooth'});
  });

  // delegation: adicionar item
  document.addEventListener('click', function(e){
    var addBtn = safeClosest(e.target, '.btn-add');
    if (!addBtn) return;
    var card = addBtn.closest('.product-card');
    if (!card) return;
    var id = card.getAttribute('data-id') || ('p-' + Date.now());
    var name = card.getAttribute('data-name') || (card.querySelector('.card-title') && card.querySelector('.card-title').textContent) || 'Produto';
    var price = Number(card.getAttribute('data-price') || 0);
    var img = (card.querySelector('img') && card.querySelector('img').src) || null;
    var existing = cart.find(function(i){ return i.id === id; });
    if (existing) { existing.qty = (existing.qty || 0) + 1; }
    else { cart.push({ id:id, name:name, priceCents:price, qty:1, image:img }); }
    updateCartUI();

    // mostra toast perto do botão
    var qtyNow = existing ? existing.qty : 1;
    try { showFloatingToast(addBtn, name, qtyNow); } catch(err){}
  });

  // delegação para controles dentro do modal (inc/dec/rem)
  cartListEl && cartListEl.addEventListener('click', function(e){
    var btn = safeClosest(e.target, 'button');
    if (!btn) return;
    var i = Number(btn.getAttribute('data-i'));
    var action = btn.getAttribute('data-action');
    if (!Number.isFinite(i) || i < 0 || i >= cart.length) return;
    if (action === 'inc') cart[i].qty = (cart[i].qty || 0) + 1;
    if (action === 'dec') cart[i].qty = Math.max(1, (cart[i].qty || 1) - 1);
    if (action === 'rem') cart.splice(i,1);
    updateCartUI();
  });

  return { update:updateCartUI, open:openCart, close:closeCart, _cartRef: cart };
})();


  /* ---------- AUTH UI (header + modals) ---------- */
  (function(){
    var btnLogin = document.getElementById('btnLogin');
    var loginModal = document.getElementById('loginModal');
    var signupModal = document.getElementById('signupModal');
    var btnCloseLogin = document.getElementById('btnCloseLogin');
    var btnCloseSignup = document.getElementById('btnCloseSignup');
    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var openSignupFromLogin = document.getElementById('openSignupFromLogin');
    var openLoginFromSignup = document.getElementById('openLoginFromSignup');
    var userArea = document.getElementById('userArea');

    function renderUserArea(){
      var cur = Auth.current();
      if (!userArea) return;
      userArea.innerHTML = '';
      if (cur && cur.name) {
        var wrapper = document.createElement('div');
        wrapper.className = 'user-menu';
        wrapper.innerHTML =
          '<button id="userChip" class="user-chip">'+ (cur.name.split(' ')[0] || cur.name) +' ▾</button>'
          + '<div id="userDropdown" class="user-dropdown" style="display:none;position:absolute;background:var(--surface);border:1px solid rgba(255,255,255,0.03);padding:8px;border-radius:8px;">'
            + '<a href="#meuspedidos" style="display:block;padding:6px 8px;text-decoration:none;color:var(--muted)">Meus pedidos</a>'
            + '<button id="btnLogout" class="btn btn-ghost" style="margin-top:6px;">Sair</button>'
          + '</div>';
        userArea.appendChild(wrapper);

        var chip = document.getElementById('userChip');
        var dropdown = document.getElementById('userDropdown');
        var btnLogout = document.getElementById('btnLogout');
        chip && chip.addEventListener('click', function(e){
          dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', function(ev){
          if (!ev.target.closest('.user-menu')) {
            if (dropdown) dropdown.style.display = 'none';
          }
        });
        btnLogout && btnLogout.addEventListener('click', function(){
          Auth.logout();
          renderUserArea();
          alert('Você saiu da conta.');
        });
      } else {
        var b = document.createElement('button');
        b.className = 'btn btn-ghost';
        b.id = 'btnLoginHeader';
        b.textContent = 'Entrar';
        userArea.appendChild(b);
        b.addEventListener('click', function(){ openModal(loginModal, b); });
      }
    }

    renderUserArea();

    btnLogin && btnLogin.addEventListener('click', function(e){ openModal(loginModal, e.currentTarget); });

    btnCloseLogin && btnCloseLogin.addEventListener('click', function(){ closeModal(loginModal); });
    btnCloseSignup && btnCloseSignup.addEventListener('click', function(){ closeModal(signupModal); });

    openSignupFromLogin && openSignupFromLogin.addEventListener('click', function(){
      closeModal(loginModal); openModal(signupModal);
    });
    openLoginFromSignup && openLoginFromSignup.addEventListener('click', function(){
      closeModal(signupModal); openModal(loginModal);
    });

    document.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.classList && t.classList.contains('pass-toggle')) {
        var targetId = t.getAttribute('data-target');
        var input = document.getElementById(targetId);
        if (!input) return;
        if (input.type === 'password') { input.type = 'text'; t.textContent = '🙈'; }
        else { input.type = 'password'; t.textContent = '👁️'; }
        input.focus();
      }
    });

    loginForm && loginForm.addEventListener('submit', function(e){
      e.preventDefault();
      var email = document.getElementById('loginEmail').value.trim();
      var pass = document.getElementById('loginPassword').value;
      var res = Auth.login(email,pass);
      if (!res.ok) { alert(res.msg || 'Erro ao entrar'); return; }
      closeModal(loginModal);
      renderUserArea();
      alert('Bem-vindo de volta!');
    });

    signupForm && signupForm.addEventListener('submit', function(e){
      e.preventDefault();
      var name = document.getElementById('signupName').value.trim();
      var email = document.getElementById('signupEmail').value.trim();
      var phone = document.getElementById('signupPhone').value.trim();
      var pass = document.getElementById('signupPassword').value;
      if (pass.length < 6) { alert('Senha deve ter pelo menos 6 caracteres.'); return; }
      var res = Auth.register({name:name,email:email,password:pass,phone:phone});
      if (!res.ok) { alert(res.msg || 'Erro ao cadastrar'); return; }
      closeModal(signupModal);
      renderUserArea();
      alert('Conta criada com sucesso! Você já está logado.');
    });

    var loginBackdrop = document.getElementById('loginBackdrop');
    loginBackdrop && loginBackdrop.addEventListener('click', function(){ closeModal(loginModal); });
    var signupBackdrop = document.getElementById('signupBackdrop');
    signupBackdrop && signupBackdrop.addEventListener('click', function(){ closeModal(signupModal); });

    if (Auth.current()) renderUserArea();
  })();

  /* ---------- HERO ROTATOR ---------- */
  (function(){
    var slides = Array.from(document.querySelectorAll('.hero-slide'));
    var dotsWrap = document.getElementById('heroDots');
    var prev = document.getElementById('heroPrev');
    var next = document.getElementById('heroNext');
    if (!slides.length) return;
    var idx = 0;
    slides.forEach(function(s, i){
      var btn = document.createElement('button');
      btn.dataset.i = i;
      if (i===0) btn.classList.add('active');
      dotsWrap.appendChild(btn);
      btn.addEventListener('click', function(){ goTo(i); });
    });
    function update(){
      slides.forEach(function(s,i){ s.style.display = (i===idx?'flex':'none'); });
      Array.from(dotsWrap.children).forEach(function(d,i){ d.classList.toggle('active', i===idx); });
    }
    function goTo(i){ idx = (i+slides.length)%slides.length; update(); }
    prev && prev.addEventListener('click', function(){ goTo(idx-1); });
    next && next.addEventListener('click', function(){ goTo(idx+1); });

    var auto = setInterval(function(){ goTo(idx+1); }, 6000);
    var rot = document.querySelector('.hero-rotator');
    rot && rot.addEventListener('mouseenter', function(){ clearInterval(auto); });
    rot && rot.addEventListener('mouseleave', function(){ auto = setInterval(function(){ goTo(idx+1); }, 6000); });

    update();
  })();

  /* ---------- lazy load images (simple) ---------- */
  (function(){
    var imgs = document.querySelectorAll('img');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (e.isIntersecting) {
            var img = e.target;
            if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
            io.unobserve(img);
          }
        });
      },{rootMargin:'200px'});
      imgs.forEach(function(img){ if (img.dataset.src) io.observe(img); });
    }
  })();

  /* ---------- footer year ---------- */
  (function(){ var y = document.getElementById('year'); if (y) y.textContent = String(new Date().getFullYear()); })();

  /* ---------- ensure cart UI update on load (FAB state) ---------- */
  setTimeout(function(){ try{ CartModule.update(); }catch(e){} }, 120);

});
