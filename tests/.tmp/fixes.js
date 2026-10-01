// ── Optional custom-map appearance adapter ─────────────────────────
// The server adds map.customAppearance without changing the official map
// schema. Keep the data isolated and let a renderer-specific hook consume it.
;(function () {
  if (window.$_customMapAppearanceAdapter) return;
  window.$_customMapAppearanceAdapter = true;
  window.$_customMapAppearance = null;

  var assigned = [];
  function appearanceForElement(element) {
    var appearance = window.$_customMapAppearance;
    if (!appearance) {
      try {
        var renderer = window.isoEngine && window.isoEngine.mapRenderer;
        var map = renderer && renderer.map;
        if (map && map.customAppearance) {
          appearance = map.customAppearance;
          window.$_customMapAppearance = appearance;
        }
      } catch (_) {}
    }
    if (!appearance || !Array.isArray(appearance.instances) || !element) return null;
    var cellId = Number(element.position);
    var gfxId = Number(element.g);
    var layer = Number(element.layer || 0);
    for (var i = 0; i < appearance.instances.length; i++) {
      var item = appearance.instances[i];
    if (Number(item.cellId) !== cellId) continue;
    if (layer && Number(item.layer) !== layer) continue;
    if (!layer && Number(item.gfxId) !== gfxId) continue;
      if (assigned.indexOf(item.instanceId) !== -1) continue;
      assigned.push(item.instanceId);
      return item;
    }
    return null;
  }

  window.__cuervokPrepareMapElement = function (element) {
    try {
      if (element && !element.__cuervokAppearance) {
        element.__cuervokAppearance = appearanceForElement(element);
      }
    } catch (_) {}
  };

  window.__cuervokApplyMapElement = function (sprite, element) {
    try {
      var item = element && element.__cuervokAppearance;
      if (!sprite || !item) return sprite;
      if (item.visible === false) {
        if (typeof sprite.remove === 'function') sprite.remove();
        else sprite.visible = false;
        return sprite;
      }
      var scale = Math.max(0.01, Math.min(10, Number(item.scale || 100) / 100));
      var opacity = Math.max(0, Math.min(1, Number(item.opacity === undefined ? 1 : item.opacity)));
      if (typeof sprite.x === 'number') sprite.x += Number(item.x || 0);
      if (typeof sprite.y === 'number') sprite.y += Number(item.y || 0);
      if (sprite.scale && typeof sprite.scale.set === 'function') {
        sprite.scale.set(sprite.scale.x * scale, sprite.scale.y * scale);
      } else if (sprite.scale) {
        sprite.scale.x *= scale;
        sprite.scale.y *= scale;
      }
      if ('alpha' in sprite) sprite.alpha *= opacity;
      if (item.rotation) sprite.rotation += Number(item.rotation) * Math.PI / 2;
      if (item.flip && sprite.scale) sprite.scale.x *= -1;
      if ('zIndex' in sprite) sprite.zIndex = Number(item.priority || 0);
      if (sprite.parent && sprite.parent.sortableChildren !== undefined) sprite.parent.sortableChildren = true;
    } catch (_) {}
    return sprite;
  };

  function readAppearance() {
    try {
      var renderer = window.isoEngine && window.isoEngine.mapRenderer;
      var map = renderer && renderer.map;
      var appearance = map && map.customAppearance;
      if (!appearance || appearance.version !== 1 || !Array.isArray(appearance.instances)) {
        window.$_customMapAppearance = null;
        return;
      }
      window.$_customMapAppearance = appearance;
      assigned = [];
      if (typeof window.$_applyCustomMapAppearance === 'function') {
        window.$_applyCustomMapAppearance(renderer, appearance);
      }
    } catch (_) {
      window.$_customMapAppearance = null;
    }
  }

  function watchRenderer() {
    try {
      var engine = window.isoEngine;
      if (engine && typeof engine.on === 'function') {
        engine.on('mapLoaded', readAppearance);
        readAppearance();
        return;
      }
    } catch (_) {}
    window.setTimeout(watchRenderer, 250);
  }

  watchRenderer();
})();

// ── openUrlInAppBrowser fix ────────────────────────────────────────
// The Dofus Touch mobile client calls openUrlInAppBrowser(url) which
// internally creates a hidden <iframe> or uses Cordova's InAppBrowser.
// In the emulator both paths fail:
//   • window.open() returns null (no opener context in Electron)
//   • The game then calls .addEventListener on null → TypeError
//
// Fix: 1) Wrap window.open to always return an object with addEventListener
//      2) Provide a global openUrlInAppBrowser that catches all errors
//      3) Cordova mock as a last resort
// ────────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_openUrlFixed) return;
  window.$_openUrlFixed = true;

  // ── A. Mock Cordova InAppBrowser (backup path) ──────────────────────
  if (!window.cordova) window.cordova = {};
  if (!window.cordova.InAppBrowser) {
    window.cordova.InAppBrowser = {
      open: function (url) {
        if (url) window.open(url, '_blank');
        return {
          addEventListener: function () {},
          removeEventListener: function () {},
          close: function () {},
          show: function () {},
          hide: function () {},
          executeScript: function () {},
          insertCSS: function () {}
        };
      }
    };
  }

  // ── B. Wrap window.open so it never returns null ────────────────────
  //    The game's openUrlInAppBrowser calls window.open() and then
  //    calls .addEventListener() on the result. When window.open()
  //    returns null (common in Electron iframes), we return a mock.
  var _origOpen = window.open;
  window.open = function (url, target, features) {
    // Actually open the URL in the system browser
    if (url && url !== 'about:blank') {
      try { _origOpen.call(window, url, '_blank'); } catch (_) {}
    }
    // Always return an object with addEventListener so callers don't crash
    return {
      document: { write: function () {}, close: function () {} },
      location: { href: url || '' },
      addEventListener: function () {},
      removeEventListener: function () {},
      close: function () {},
      focus: function () {},
      postMessage: function () {}
    };
  };

  // ── C. Global openUrlInAppBrowser (intercept future assignment) ──────
  var _setOnWindow = false;
  try {
    var _desc = Object.getOwnPropertyDescriptor(window, 'openUrlInAppBrowser');
    if (_desc && typeof _desc.value === 'function') {
      var _orig = _desc.value;
      window.openUrlInAppBrowser = function (url, opts) {
        try { return _orig.call(this, url, opts); }
        catch (err) {
          console.warn('[DofEmu] openUrlInAppBrowser failed, fallback:', err.message);
          if (url) window.open(url, '_blank');
        }
      };
      _setOnWindow = true;
    }
  } catch (_) {}

  if (!_setOnWindow) {
    try {
      Object.defineProperty(window, 'openUrlInAppBrowser', {
        configurable: true,
        enumerable: true,
        get: function () { return this.__openUrlImpl || null; },
        set: function (fn) {
          if (typeof fn === 'function') {
            var realFn = fn;
            this.__openUrlImpl = function (url, opts) {
              try { return realFn.call(this, url, opts); }
              catch (err) {
                console.warn('[DofEmu] openUrlInAppBrowser failed, fallback:', err.message);
                if (url) window.open(url, '_blank');
              }
            };
          } else {
            this.__openUrlImpl = fn;
          }
        }
      });
    } catch (_) {}
  }

  // ── D. Global error handler: catch any remaining null crashes ────────
  window.addEventListener('error', function (e) {
    try {
      var msg = e && (e.message || (e.error && e.error.message) || '');
      if (msg.indexOf('addEventListener') !== -1 && msg.indexOf('null') !== -1) {
        console.warn('[DofEmu] Suppressed null addEventListener crash');
        e.preventDefault();
        return true;
      }
    } catch (_) {}
  }, true);
})();

var events = {
  mousedown: "touchstart",
  mouseup: "touchend",
  mousemove: "touchmove"
};

var mouseDown = false;

var handleEvents = function(e) {
  try {
  
    if (e.type === "mousedown") mouseDown = true;
    else if (e.type === "mouseup") mouseDown = false;
    if (!mouseDown && e.type === "mousemove") return;

    var touchObj = new Touch({
      identifier: 0,
      target: e.target,
      clientX: e.clientX,
      clientY: e.clientY,
      pageX: e.pageX,
      pageY: e.pageY,
      screenX: e.screenX,
      screenY: e.screenY,
      radiusX: 11.5,
      radiusY: 11.5,
      rotationAngle: 0,
      force: e.type === "mouseup" ? 0 : 1
    });

    var touchEvent = new TouchEvent(events[e.type], {
      cancelable: true,
      bubbles: true,
      touches: e.type === "mouseup" ? [] : [touchObj],
      targetTouches: e.type === "mouseup" ? [] : [touchObj],
      changedTouches: [touchObj],
      shiftKey: false,
      composed: true,
      isTrusted: true,
      sourceCapabilities: new InputDeviceCapabilities({ firesTouchEvents: true }),
      view: window
    });

    e.target.dispatchEvent(touchEvent);
  } catch (err) {
    top.console.log(err);
  }
  e.stopPropagation();
  return false;
};

for (var id in events) {
  document.body.addEventListener(id, handleEvents, true);
}

// ─────────────────────────────────────────────────────────────────────
// Guild Donation/Boosts tab (custom feature)
//
// The emulator exposes the GuildWindow class as window.$_guildBoostWindowClass
// (regex patch in processGame). We hook its _setupDom to append a native
// "Donation / Boosts" tab. The tab requests GuildBoostPanelMessage (infoType 99)
// and listens on the connectionManager for live updates (treasury, boosts,
// donations), which the server broadcasts to every online member after a
// donation or a boost purchase.
// ─────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_guildBoostInjected) return;
  window.$_guildBoostInjected = true;

  var TAB_ID = 'donationBoosts';
  var TAB_LABEL = 'Donación / Boosts';
  var INFO_BOOSTS_PANEL = 99; // GuildManager.INFO_GUILD_BOOSTS_PANEL
  var CURRENCY_KAMAS = 0;
  var CURRENCY_GOULTINES = 1;

  var content = null;       // WuiDom content of the injected tab
  var lastMsg = null;       // last GuildBoostPanelMessage
  var payCurrency = CURRENCY_KAMAS; // selected currency for purchases
  var hookDone = false;

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  function fmt(n) {
    n = Math.round(Number(n) || 0);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function send(type, data) {
    try {
      if (window.dofus && typeof window.dofus.sendMessage === 'function') {
        window.dofus.sendMessage(type, data || {});
      }
    } catch (err) { /* ignore */ }
  }

  function requestPanel() {
    send('GuildGetInformationsMessage', { infoType: INFO_BOOSTS_PANEL });
  }

  function hookGuildWindow() {
    if (hookDone || !window.$_guildBoostWindowClass) return;
    var Cls = window.$_guildBoostWindowClass;
    if (!Cls || !Cls.prototype) return;
    hookDone = true;

    var orig = Cls.prototype._setupDom;
    Cls.prototype._setupDom = function () {
      orig.call(this);
      try { addBoostTab(this); } catch (err) { console.error('guild boost tab', err); }
    };
  }

  function addBoostTab(guildWin) {
    if (!guildWin || !guildWin.tabs || guildWin.$_boostTabAdded) return;
    guildWin.$_boostTabAdded = true;

    content = guildWin.createChild('div', { className: 'guildBoostPanel' });
    guildWin.tabs.addTab(TAB_LABEL, content, TAB_ID);

    content.on('open', function () {
      requestPanel();
      if (lastMsg) renderPanel(lastMsg);
    });

    // Initial placeholder
    content.rootElement.appendChild(el('div', 'guildBoostHint', 'Cargando…'));
    requestPanel();
  }

  // ── Renderers ────────────────────────────────────────────────────────

  function renderPanel(msg) {
    lastMsg = msg;
    if (!content || !content.rootElement) return;
    var root = content.rootElement;
    root.innerHTML = '';

    // Treasury header + donation button
    var treasury = el('div', 'guildBoostTreasury');
    var tTitle = el('div', 'guildBoostSectionTitle', 'Tesorería');
    treasury.appendChild(tTitle);

    var balances = el('div', 'guildBoostBalances');
    balances.appendChild(el('div', 'guildBoostBalance', 'Kamas: ' + fmt(msg.treasuryKamas)));
    balances.appendChild(el('div', 'guildBoostBalance goultines', 'Goultines: ' + fmt(msg.treasuryGoultines)));
    treasury.appendChild(balances);

    var myWallets = el('div', 'guildBoostMyWallets',
      'Tus fondos — Kamas: ' + fmt(msg.myKamas) + ' · Goultines: ' + fmt(msg.myGoultines));
    treasury.appendChild(myWallets);

    var donateBtn = el('div', 'guildBoostBtn donate', 'Donar');
    donateBtn.addEventListener('click', function () { openDonateModal(msg); });
    treasury.appendChild(donateBtn);
    root.appendChild(treasury);

    // Currency toggle for purchases
    var payRow = el('div', 'guildBoostPayRow');
    payRow.appendChild(el('span', 'guildBoostPayLabel', 'Pagar con:'));
    var kBtn = el('div', 'guildBoostBtn mini' + (payCurrency === CURRENCY_KAMAS ? ' on' : ''), 'Kamas');
    var gBtn = el('div', 'guildBoostBtn mini' + (payCurrency === CURRENCY_GOULTINES ? ' on' : ''), 'Goultines');
    kBtn.addEventListener('click', function () {
      payCurrency = CURRENCY_KAMAS;
      if (lastMsg) renderPanel(lastMsg);
    });
    gBtn.addEventListener('click', function () {
      payCurrency = CURRENCY_GOULTINES;
      if (lastMsg) renderPanel(lastMsg);
    });
    payRow.appendChild(kBtn);
    payRow.appendChild(gBtn);
    root.appendChild(payRow);

    // Boosts table
    var boosts = el('div', 'guildBoostBoosts');
    boosts.appendChild(el('div', 'guildBoostSectionTitle', 'Boosts de la guilde'));

    var header = el('div', 'guildBoostRow header');
    header.appendChild(el('div', 'colEffect', 'Efecto'));
    header.appendChild(el('div', 'colLevel', 'Nivel'));
    header.appendChild(el('div', 'colPrice', 'Precio'));
    header.appendChild(el('div', 'colBuy', ''));
    boosts.appendChild(header);

    var boostsArr = msg.boosts || [];
    if (!boostsArr.length) {
      boosts.appendChild(el('div', 'guildBoostHint', 'Sin datos de boosts.'));
    }
    for (var i = 0; i < boostsArr.length; i++) {
      var b = boostsArr[i];
      var row = el('div', 'guildBoostRow');

      var effectCol = el('div', 'colEffect');
      effectCol.appendChild(el('div', 'guildBoostName', b.label));
      effectCol.appendChild(el('div', 'guildBoostEffect', b.effect));
      row.appendChild(effectCol);

      var lvl = el('div', 'colLevel');
      lvl.appendChild(el('div', 'guildBoostLevel', b.current + ' / ' + b.max));
      var bar = el('div', 'guildBoostBar');
      var fill = el('div', 'guildBoostBarFill');
      fill.style.width = Math.min(100, Math.round((b.current / b.max) * 100)) + '%';
      bar.appendChild(fill);
      lvl.appendChild(bar);
      row.appendChild(lvl);

      var priceCol = el('div', 'colPrice');
      if (payCurrency === CURRENCY_KAMAS) {
        priceCol.appendChild(el('div', 'guildBoostPrice', fmt(b.kamasPrice) + ' K'));
        priceCol.appendChild(el('div', 'guildBoostPrice alt', fmt(b.goultinesPrice) + ' G'));
      } else {
        priceCol.appendChild(el('div', 'guildBoostPrice', fmt(b.goultinesPrice) + ' G'));
        priceCol.appendChild(el('div', 'guildBoostPrice alt', fmt(b.kamasPrice) + ' K'));
      }
      row.appendChild(priceCol);

      var buyCol = el('div', 'colBuy');
      var canBuy = msg.canManage && !b.maxed;
      if (canBuy) {
        var buyBtn = el('div', 'guildBoostBtn buy', 'Comprar');
        buyBtn.addEventListener('click', function (id) {
          return function () {
            send('GuildBoostPurchaseRequestMessage', { boostId: id, currency: payCurrency });
          };
        }(b.boostId));
        buyCol.appendChild(buyBtn);
      } else {
        buyCol.appendChild(el('div', 'guildBoostBtn buy disabled', b.maxed ? 'Máx' : '—'));
      }
      row.appendChild(buyCol);

      boosts.appendChild(row);
    }
    root.appendChild(boosts);

    // Recent donations
    var don = el('div', 'guildBoostDonations');
    don.appendChild(el('div', 'guildBoostSectionTitle', 'Últimos donativos'));
    var donArr = msg.donations || [];
    if (!donArr.length) {
      don.appendChild(el('div', 'guildBoostHint', 'Todavía no hay donativos.'));
    }
    for (var j = 0; j < donArr.length; j++) {
      var d = donArr[j];
      var dRow = el('div', 'guildBoostDonationRow');
      var when = d.timestamp ? new Date(d.timestamp * 1000) : null;
      var whenTxt = when ? when.toLocaleDateString('es-ES') + ' ' + when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      dRow.appendChild(el('span', 'guildBoostDonationName', d.characterName));
      dRow.appendChild(el('span', 'guildBoostDonationAmount',
        fmt(d.amount) + (d.currency === CURRENCY_GOULTINES ? ' G' : ' K')));
      dRow.appendChild(el('span', 'guildBoostDonationWhen', whenTxt));
      don.appendChild(dRow);
    }
    root.appendChild(don);
  }

  // ── Donation modal ───────────────────────────────────────────────────

  function openDonateModal(msg) {
    closeDonateModal();

    var overlay = el('div', 'guildBoostModalOverlay');
    var box = el('div', 'guildBoostModal');

    var title = el('div', 'guildBoostModalTitle', 'Donar a la guilde');
    box.appendChild(title);

    var cur = CURRENCY_KAMAS;
    var curRow = el('div', 'guildBoostModalCurRow');
    var kBtn = el('div', 'guildBoostBtn mini on', 'Kamas');
    var gBtn = el('div', 'guildBoostBtn mini', 'Goultines');
    function refreshCur() {
      kBtn.className = 'guildBoostBtn mini' + (cur === CURRENCY_KAMAS ? ' on' : '');
      gBtn.className = 'guildBoostBtn mini' + (cur === CURRENCY_GOULTINES ? ' on' : '');
      balanceTxt.textContent = cur === CURRENCY_KAMAS
        ? 'Disponible: ' + fmt(msg.myKamas) + ' Kamas'
        : 'Disponible: ' + fmt(msg.myGoultines) + ' Goultines';
    }
    kBtn.addEventListener('click', function () { cur = CURRENCY_KAMAS; refreshCur(); });
    gBtn.addEventListener('click', function () { cur = CURRENCY_GOULTINES; refreshCur(); });
    curRow.appendChild(kBtn);
    curRow.appendChild(gBtn);
    box.appendChild(curRow);

    var balanceTxt = el('div', 'guildBoostModalBalance');
    box.appendChild(balanceTxt);

    var input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.placeholder = 'Cantidad';
    input.className = 'guildBoostModalInput';
    box.appendChild(input);

    var btnRow = el('div', 'guildBoostModalBtns');
    var cancel = el('div', 'guildBoostBtn mini', 'Cancelar');
    cancel.addEventListener('click', closeDonateModal);
    var confirm = el('div', 'guildBoostBtn mini confirm', 'Confirmar');
    confirm.addEventListener('click', function () {
      var amount = parseInt(input.value, 10);
      if (!amount || amount <= 0) return;
      send('GuildDonationRequestMessage', { currency: cur, amount: amount });
      closeDonateModal();
    });
    btnRow.appendChild(cancel);
    btnRow.appendChild(confirm);
    box.appendChild(btnRow);

    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDonateModal(); });
    document.body.appendChild(overlay);
    refreshCur();
    setTimeout(function () { input.focus(); }, 50);
  }

  function closeDonateModal() {
    var o = document.querySelector('.guildBoostModalOverlay');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  // ── Boot: hook + live updates ────────────────────────────────────────

  function listenLive() {
    try {
      if (window.dofus && window.dofus.connectionManager) {
        if (!window.$_guildBoostListening) {
          window.$_guildBoostListening = true;
          window.dofus.connectionManager.on('GuildBoostPanelMessage', function (msg) {
            renderPanel(msg);
          });
        }
      }
    } catch (err) { /* ignore */ }
  }

  hookGuildWindow();
  listenLive();
  var bootTimer = setInterval(function () {
    hookGuildWindow();
    listenLive();
    if (hookDone) clearInterval(bootTimer);
  }, 1000);
})();

// ─────────────────────────────────────────────────────────────────────
// Admin panel + debug mode (custom feature, admins only)
//
// The server gates every admin message on the account role (>= 2), so the
// panel is inert for non-admins even if this code runs for everyone.
//  • !paneadm  → server sends AdminPanelOpenMessage → the panel opens.
//  • The panel browses the item catalog (AdminItemSearchRequestMessage),
//    grants items (AdminGrantItemMessage) and toggles debug mode
//    (AdminDebugModeMessage).
//  • Debug mode: DOUBLE TAPPING the same map cell within ~400ms teleports
//    the character there (AdminDebugTeleportMessage) instead of walking.
//    We intercept the outgoing GameMapMovementRequestMessage — the last
//    keyMovement encodes the destination as cellId | (direction << 12),
//    so cellId = last & 4095, no bundle patching or coordinate math.
//    A single tap always passes through untouched (normal walking keeps
//    working with debug ON); only the second tap on the same cell within
//    the double-tap window is converted into a teleport.
// ─────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_adminPanelInjected) return;
  window.$_adminPanelInjected = true;

  var debugOn = false;
  var isAdmin = false;
  var types = [];       // AdminItemTypeInfo[]
  var lastItems = [];   // AdminItemInfo[] (current page)
  var total = 0;
  var page = 0;
  var query = '';
  var typeId = 0;
  var active = false;
  var panelRoot = null;
  var lastTapCell = -1; // double-tap detection state
  var lastTapTime = 0;
  var DOUBLE_TAP_MS = 400;

  function send(type, data) {
    try {
      if (window.dofus && typeof window.dofus.sendMessage === 'function') {
        window.dofus.sendMessage(type, data || {});
      }
    } catch (err) { /* ignore */ }
  }

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  function inFight() {
    try {
      var fm = window.gui && window.gui.fightManager;
      return !!(fm && typeof fm.isInFight === 'function' && fm.isInFight());
    } catch (e) { return false; }
  }

  // ── Debug teleport: DOUBLE TAP on the same cell = instant teleport ──
  // The bundle re-sends GameMapMovementRequestMessage when the tapped cell
  // changes (and even when re-tapping the destination while walking: it
  // cancels the current walk, then re-paths).  So a double tap on the SAME
  // cell produces two requests to that cell within ~400ms: the first passes
  // through (the character walks normally), the second becomes a teleport.
  function hookSendMessage() {
    if (window.$_adminSendHooked) return;
    var dofus = window.dofus;
    if (!dofus || typeof dofus.sendMessage !== 'function') return;
    var orig = dofus.sendMessage.bind(dofus);
    dofus.sendMessage = function (type, data) {
      try {
        if (debugOn && isAdmin && type === 'GameMapMovementRequestMessage' &&
            data && data.keyMovements && data.keyMovements.length && !inFight()) {
          var last = data.keyMovements[data.keyMovements.length - 1];
          var cellId = Number(last) & 4095; // cellId | (direction << 12)
          var now = Date.now();
          if (cellId === lastTapCell && now - lastTapTime < DOUBLE_TAP_MS) {
            lastTapCell = -1; // consume the double tap
            send('AdminDebugTeleportMessage', { cellId: cellId });
            return; // swallow this walk — teleport instead
          }
          lastTapCell = cellId;
          lastTapTime = now;
        }
      } catch (err) { /* fall through to the normal send */ }
      return orig(type, data);
    };
    window.$_adminSendHooked = true;
  }

  // ── Panel UI ────────────────────────────────────────────────────────

  function openPanel(msg) {
    if (!panelRoot) buildPanel();
    active = true;
    var header = panelRoot.querySelector('.adminPanelHeaderInfo');
    if (header) {
      header.textContent = (msg.characterName || '?') +
        ' · ' + fmt((msg && msg.kamas) || 0) + ' kamas';
    }
    refreshTypeSelect();
    panelRoot.style.display = 'block';
    search();
  }

  function closePanel() {
    active = false;
    if (panelRoot) panelRoot.style.display = 'none';
  }

  function fmt(n) {
    n = Math.round(Number(n) || 0);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function refreshTypeSelect() {
    var sel = panelRoot.querySelector('.adminTypeSelect');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '';
    sel.appendChild(el('option', '', 'Todos los tipos'));
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var o = el('option', '', (t.nameId || 'Tipo ' + t.id) + ' (' + t.id + ')');
      o.value = String(t.id);
      sel.appendChild(o);
    }
    if (prev) sel.value = prev;
  }

  function search() {
    var qEl = panelRoot.querySelector('.adminQueryInput');
    var tEl = panelRoot.querySelector('.adminTypeSelect');
    query = qEl ? qEl.value : '';
    typeId = tEl ? parseInt(tEl.value, 10) || 0 : 0;
    page = 0;
    send('AdminItemSearchRequestMessage', { query: query, typeId: typeId, page: 0 });
  }

  function goPage(delta) {
    var next = page + delta;
    if (next < 0) next = 0;
    if (total && next * 50 >= total && next > 0) next = Math.max(0, Math.ceil(total / 50) - 1);
    page = next;
    send('AdminItemSearchRequestMessage', { query: query, typeId: typeId, page: page });
  }

  function renderResults() {
    var list = panelRoot.querySelector('.adminItemList');
    if (!list) return;
    list.innerHTML = '';
    var target = targetName();

    if (!lastItems.length) {
      list.appendChild(el('div', 'adminEmpty', 'Sin resultados.'));
    }
    function assetUrl(route) {
      try {
        return (window.Config && window.Config.assetsUrl || 'http://127.0.0.1:8765/assets/') + route;
      } catch (e) { return ''; }
    }

    function typeName(typeId) {
      for (var i = 0; i < types.length; i++) {
        if (String(types[i].id) === String(typeId)) return types[i].nameId || ('Tipo ' + typeId);
      }
      return 'Tipo ' + typeId;
    }

    for (var i = 0; i < lastItems.length; i++) {
      var it = lastItems[i];
      var row = el('div', 'adminItemRow');

      // Item icon (gfx/items/{iconId}.png — same route the game uses for
      // inventory icons) so admins can recognise the item at a glance.
      var icon = document.createElement('img');
      icon.className = 'adminItemIcon';
      icon.src = assetUrl('gfx/items/' + (it.iconId || 0) + '.png');
      icon.alt = it.nameId || ('Item ' + it.id);
      row.appendChild(icon);

      var info = el('div', 'adminItemInfo');
      var name = el('div', 'adminItemName', it.nameId || ('Item ' + it.id));
      var meta = el('div', 'adminItemMeta', '#' + it.id + ' · ' + typeName(it.typeId) + ' · nivel ' + it.level);
      info.appendChild(name);
      info.appendChild(meta);
      row.appendChild(info);

      var btns = el('div', 'adminItemBtns');
      var add1 = el('div', 'adminBtn add', '+1');
      add1.addEventListener('click', (function (gid) {
        return function () { grant(gid, 1); };
      })(it.id));
      var add10 = el('div', 'adminBtn add', '+10');
      add10.addEventListener('click', (function (gid) {
        return function () { grant(gid, 10); };
      })(it.id));
      btns.appendChild(add1);
      btns.appendChild(add10);
      row.appendChild(btns);
      list.appendChild(row);
    }

    var pager = panelRoot.querySelector('.adminPager');
    if (pager) {
      pager.innerHTML = '';
      var prevBtn = el('div', 'adminBtn', '‹ Anterior');
      prevBtn.addEventListener('click', function () { goPage(-1); });
      var label = el('div', 'adminPagerLabel', 'Página ' + (page + 1) + ' / ' + Math.max(1, Math.ceil(total / 50)) + ' (' + total + ')');
      var nextBtn = el('div', 'adminBtn', 'Siguiente ›');
      nextBtn.addEventListener('click', function () { goPage(1); });
      pager.appendChild(prevBtn);
      pager.appendChild(label);
      pager.appendChild(nextBtn);
    }
  }

  function targetName() {
    var t = panelRoot.querySelector('.adminTargetInput');
    return t ? t.value.trim() : '';
  }

  function grant(gid, qty) {
    send('AdminGrantItemMessage', { gid: gid, quantity: qty, targetName: targetName() });
  }

  function toggleDebug() {
    debugOn = !debugOn;
    var b = panelRoot.querySelector('.adminBtn.debug');
    if (b) {
      b.className = 'adminBtn debug' + (debugOn ? ' on' : '');
      b.textContent = 'Modo debug: ' + (debugOn ? 'ON' : 'OFF');
    }
    send('AdminDebugModeMessage', { enabled: debugOn });
  }

  function buildPanel() {
    panelRoot = el('div', 'adminPanelOverlay');
    var box = el('div', 'adminPanel');

    var header = el('div', 'adminPanelHeader');
    var title = el('div', 'adminPanelTitle', 'Panel Admin');
    var info = el('div', 'adminPanelHeaderInfo', '');
    var close = el('div', 'adminBtn close', '✕');
    close.addEventListener('click', closePanel);
    header.appendChild(title);
    header.appendChild(info);
    header.appendChild(close);
    box.appendChild(header);

    // Search row
    var searchRow = el('div', 'adminSearchRow');
    var qInput = el('input', 'adminQueryInput');
    qInput.type = 'text';
    qInput.placeholder = 'Buscar item por nombre o id…';
    qInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
    var typeSel = el('select', 'adminTypeSelect');
    typeSel.addEventListener('change', search);
    var searchBtn = el('div', 'adminBtn', 'Buscar');
    searchBtn.addEventListener('click', search);
    searchRow.appendChild(qInput);
    searchRow.appendChild(typeSel);
    searchRow.appendChild(searchBtn);
    box.appendChild(searchRow);

    // Results
    var list = el('div', 'adminItemList');
    box.appendChild(list);

    // Pager
    var pager = el('div', 'adminPager');
    box.appendChild(pager);

    // Footer: target + quantity + debug
    var footer = el('div', 'adminPanelFooter');
    var targetInput = el('input', 'adminTargetInput');
    targetInput.type = 'text';
    targetInput.placeholder = 'Personaje destino (vacío = tú)';
    var debugBtn = el('div', 'adminBtn debug', 'Modo debug: OFF');
    debugBtn.addEventListener('click', toggleDebug);
    var hint = el('div', 'adminHint', 'Debug ON: toca el mapa para teletransportarte a esa celda.');
    footer.appendChild(targetInput);
    footer.appendChild(debugBtn);
    box.appendChild(footer);
    box.appendChild(hint);

    panelRoot.appendChild(box);
    panelRoot.addEventListener('click', function (e) { if (e.target === panelRoot) closePanel(); });
    document.body.appendChild(panelRoot);
  }

  // ── Boot ────────────────────────────────────────────────────────────

  function listenLive() {
    try {
      var cm = window.dofus && window.dofus.connectionManager;
      if (!cm || window.$_adminLive) return;
      window.$_adminLive = true;
      cm.on('AdminPanelOpenMessage', function (msg) {
        isAdmin = !!(msg && msg.role >= 2);
        // Sync the local toggle with the server's truth (e.g. after a
        // reconnect the server-side DebugMode resets to false).
        debugOn = !!(msg && msg.debugMode);
        lastTapCell = -1;
        types = (msg && msg.itemTypes) || [];
        openPanel(msg);
      });
      cm.on('disconnect', function () {
        // Never leave debug teleport armed across sessions/characters: a
        // normal user on this window must never get taps swallowed.
        debugOn = false;
        isAdmin = false;
        lastTapCell = -1;
        closePanel();
      });
      cm.on('AdminItemListMessage', function (msg) {
        lastItems = (msg && msg.items) || [];
        total = (msg && msg.total) || 0;
        page = (msg && msg.page) || 0;
        renderResults();
      });
    } catch (err) { /* ignore */ }
  }

  var bootTimer = setInterval(function () {
    hookSendMessage();
    listenLive();
    if (window.$_adminSendHooked && window.$_adminLive) clearInterval(bootTimer);
  }, 1000);
})();

// ─────────────────────────────────────────────────────────────────────
// AUDIO PROBE (temporary diagnostic): reports the real audio state from
// inside the game page so we can see why there is no sound.
// ─────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_audioProbeRan) return;
  window.$_audioProbeRan = true;

  function reportNow(tag) {
    var r = { tag: tag, ts: new Date().toISOString(), ua: String(navigator.userAgent).slice(0, 120) };
    try { r.visibility = document.visibilityState; } catch (e) {}
    try { r.hasFocus = document.hasFocus(); } catch (e) {}
    try { r.cordova = !!window.cordova; r.wizAssets = !!window.wizAssets; } catch (e) {}
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      r.hasAudioContext = !!AC;
      if (AC) {
        var ac = new AC();
        r.acState = ac.state;
        try {
          ac.resume().then(function () { r.acStateAfterResume = ac.state; }).catch(function (err) { r.acResumeErr = String(err); });
        } catch (e) { r.acResumeErr = String(e); }
        setTimeout(function () { try { r.acStateLater = ac.state; ac.close(); } catch (e) {} }, 1500);
      }
    } catch (e) { r.acErr = String(e); }
    try {
      var m91 = window.singletons && window.singletons(91);
      if (m91) {
        r.audioPath = m91.settings && m91.settings.audioPath;
        r.globalMuted = m91.muted;
        r.acEngineState = m91.audioContext ? m91.audioContext.state : null;
        r.channels = {};
        if (m91.channels) {
          for (var ch in m91.channels) {
            var c = m91.channels[ch];
            r.channels[ch] = { volume: c.volume, muted: !!c.muted, loop: !!c.loopSound };
          }
        }
      } else {
        r.singletons91 = 'missing';
      }
    } catch (e) { r.engineErr = String(e); }
    return r;
  }

  function send(r) {
    try {
      fetch('http://127.0.0.1:8765/overrides/audioprobe.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r)
      }).catch(function () {});
    } catch (e) {}
    try { console.log('[AUDIOPROBE] ' + JSON.stringify(r)); } catch (e) {}
  }

  send(reportNow('boot'));

  // Play the login music directly, outside the engine's WebAudio graph.
  try {
    var a = new Audio('http://127.0.0.1:8765/assets/audio/20000.mp3');
    a.preload = 'auto';
    var evs = {};
    ['loadstart', 'loadedmetadata', 'canplay', 'canplaythrough', 'playing', 'pause', 'ended', 'stalled', 'waiting', 'suspend', 'abort'].forEach(function (ev) {
      a.addEventListener(ev, function () { evs[ev] = true; });
    });
    var played = false;
    try {
      var p = a.play();
      if (p && p.then) {
        p.then(function () { evs.playResolved = true; }).catch(function (e) { evs.playRejected = String(e); });
      } else { evs.playReturned = typeof p; }
    } catch (e) { evs.playThrow = String(e); }
    setTimeout(function () {
      var r = reportNow('play');
      r.play = evs;
      r.final = {
        readyState: a.readyState,
        networkState: a.networkState,
        paused: a.paused,
        currentTime: a.currentTime,
        duration: isNaN(a.duration) ? null : a.duration,
        volume: a.volume,
        muted: a.muted,
        error: a.error ? a.error.code + ' ' + a.error.message : null
      };
      send(r);
    }, 4000);
  } catch (e) {
    try { send(reportNow('playthrow')); } catch (e2) {}
  }

  window.$_audioProbe = function () { send(reportNow('manual')); };
})();

// ─────────────────────────────────────────────────────────────────────
// Goultine packs: show a real price instead of "Gratis" (DofEmu patch)
//
// The goultine packs carry a Goultine price (= pack amount) so the tile
// renders "1 200" + GOU icon instead of the "Gratis" button.  The stock
// client, however, gates every GOU purchase on the wallet balance
// (purchaseArticleOnAnkama -> openNotEnoughHardCurrencyPopup) and
// disables the shopConfirm buy button when the balance is below the
// price.  The emulator has no real-money IAP, so the packs are claimable
// for free (the game server credits the Goultines without spending a
// balance): these hooks bypass that client-side balance gate for
// goultine packs only.  Non-goultine articles keep the official
// balance-gated flow untouched.
// ─────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_goultineShopPatched) return;
  window.$_goultineShopPatched = true;

  function isGoultinePack(article) {
    try {
      var raw = article && (article._megaShopRawArticle || article);
      var refs = raw && raw.references;
      return !!(refs && refs[0] && refs[0].type === 'GOULTINE');
    } catch (err) { return false; }
  }

  // Skip the client-side "not enough Goultines" gate (module 859,
  // purchaseArticleOnAnkama) for goultine packs.
  function patchPurchaseGate() {
    try {
      var shop = window.singletons && window.singletons(859);
      if (!shop || !shop.purchaseArticleOnAnkama || shop.$_goultineGatePatched) return;
      shop.$_goultineGatePatched = true;
      var orig = shop.purchaseArticleOnAnkama.bind(shop);
      shop.purchaseArticleOnAnkama = function (article, currency) {
        try {
          if (isGoultinePack(article) && currency === 'GOU') {
            var inv = window.gui && window.gui.playerData && window.gui.playerData.inventory;
            if (inv) {
              var saved = inv.goultines;
              // Temporarily make the wallet look rich enough to pass the
              // balance gate; the confirm window renders synchronously.
              inv.goultines = Number.MAX_SAFE_INTEGER;
              var ret = orig(article, currency);
              setTimeout(function () {
                // Only restore if the wallet hasn't been refreshed with the
                // server balance since (it sends moneyGoultinesAmountSuccess
                // after the purchase credits the Goultines).
                if (inv.goultines === Number.MAX_SAFE_INTEGER) inv.goultines = saved;
              }, 2000);
              return ret;
            }
          }
        } catch (err) { /* fall through to the original */ }
        return orig(article, currency);
      };
    } catch (err) { /* never break the game for a patch failure */ }
  }

  // Keep the shopConfirm buy button enabled for goultine packs (the stock
  // update() disables it when the wallet balance is below the price).
  function patchConfirmButton() {
    try {
      var wm = window.singletons && window.singletons(52);
      if (!wm || !wm.getWindow) return;
      var sc = wm.getWindow('shopConfirm');
      if (!sc || typeof sc.update !== 'function' || sc.$_goultineConfirmPatched) return;
      sc.$_goultineConfirmPatched = true;
      var orig = sc.update.bind(sc);
      sc.update = function () {
        orig();
        try {
          var p = this.params && this.params.article;
          if (isGoultinePack(p) && this.buyBtn && typeof this.buyBtn.enable === 'function') {
            this.buyBtn.enable();
          }
        } catch (err) { /* ignore */ }
      };
    } catch (err) { /* ignore */ }
  }

  patchPurchaseGate();
  patchConfirmButton();
  var tries = 0;
  var iv = setInterval(function () {
    patchPurchaseGate();
    patchConfirmButton();
    if (++tries > 120) clearInterval(iv);
  }, 1000);
})();


// ────────────────────────────────────────────────────────────────────────
//  House properties: populate currentMapHouses from HousePropertiesMessage
//
//  The stock client only populates currentMapHouses from RealEstatePropertiesMessage.
//  If that message fails to parse or arrives too late, getHousePropertiesById()
//  returns undefined and the buy dialog crashes on i._name.
//  This patch ensures every HousePropertiesMessage also updates currentMapHouses.
// ────────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_housePropPatch) return;
  window.$_housePropPatch = true;

  function install() {
    var cm = window.dofus && window.dofus.connectionManager;
    if (!cm || cm.$_housePropInstalled) return false;
    cm.$_housePropInstalled = true;

    cm.on('HousePropertiesMessage', function (msg) {
      try {
        var props = msg && msg.properties;
        if (!props || !props.houseId) return;
        var pos = window.gui && window.gui.playerData && window.gui.playerData.position;
        if (!pos || !pos.currentMapHouses) return;
        // Store house in currentMapHouses so getHousePropertiesById works
        pos.currentMapHouses[props.houseId] = props;
        console.log('[HouseFix] Updated currentMapHouses for houseId=' + props.houseId + ' name=' + (props._name || props.ownerName || '?'));
      } catch (err) { console.error('[HouseFix] Error:', err); }
    });

    // Also patch getHousePropertiesById to handle missing houses gracefully
    // by returning a synthetic object instead of undefined
    var posModule = window.gui && window.gui.playerData && window.gui.playerData.position;
    if (posModule && typeof posModule.getHousePropertiesById === 'function' && !posModule.$_origGetHouse) {
      posModule.$_origGetHouse = posModule.getHousePropertiesById.bind(posModule);
      posModule.getHousePropertiesById = function (id) {
        var result = posModule.$_origGetHouse(id);
        if (result) return result;
        // If not found, return a minimal house info object to prevent crash
        console.warn('[HouseFix] getHousePropertiesById(' + id + ') returned undefined, creating fallback');
        return { houseId: id, _name: 'Casa #' + id, ownerName: '', modelId: 0, isOnSale: true, isClosed: false, status: 0, doorsOnMap: [] };
      };
    }

    return true;
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (install() || ++tries > 180) clearInterval(iv);
  }, 1000);
})();

// ────────────────────────────────────────────────────────────────────────
//  Timeline diagnostics (DofEmu patch)
//
//  Logs the fight timeline's turn events (GameFightTurnStart with the
//  remaining timer, and the turn-end events) so fight-timeline bugs can be
//  diagnosed from game-console.log.  The value that matters is `remaining`:
//  if it is garbage (<= 0) the client's clock (serverUtcTimeLag) or the
//  server's endTime is wrong; if the TurnStart lines are missing, the turn
//  messages never reach the client.  Safe to remove once confirmed.
// ────────────────────────────────────────────────────────────────────────
(function () {
  if (window.__dofEmuTimelineDiag) return;
  window.__dofEmuTimelineDiag = true;

  function install() {
    try {
      var gui = window.gui;
      if (!gui || !gui.fightManager || !gui.timeline) return false;
      var fm = gui.fightManager;
      if (fm.__timelineDiagInstalled) return true;
      fm.__timelineDiagInstalled = true;

      fm.on("GameFightTurnStart", function (id, endTime) {
        try {
          var remaining = Math.max(0, endTime - Date.now());
          console.log("[TIMELINE] TurnStart id=" + id + " endTime=" + endTime + " remaining=" + remaining + "ms");
        } catch (e) {}
      });
      fm.on("gameFightTurnEnd", function (id) {
        try { console.log("[TIMELINE] TurnEnd event id=" + id); } catch (e) {}
      });
      fm.on("GameFightTurnReadyRequestMessage", function (e) {
        try { console.log("[TIMELINE] ReadyRequest id=" + (e && e.id)); } catch (err) {}
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (install() || ++tries > 180) clearInterval(iv);
  }, 1000);
})();

