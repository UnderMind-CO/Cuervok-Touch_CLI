// ── Optional custom-map appearance adapter ─────────────────────────
// The server adds map.customAppearance without changing the official map
// schema. Keep the data isolated and let a renderer-specific hook consume it.
;(function () {
  if (window.$_customMapAppearanceAdapter) return;
  window.$_customMapAppearanceAdapter = true;
  window.$_customMapAppearance = null;

  var assigned = [];
  function normalizeAppearance(appearance) {
    if (!appearance) return null;
    var out = {
      version: appearance.version !== undefined ? appearance.version : appearance.Version,
      mapId: appearance.mapId !== undefined ? appearance.mapId : appearance.MapId,
      instances: []
    };
    var list = appearance.instances || appearance.Instances || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i] || {};
      out.instances.push({
        instanceId: s.instanceId || s.InstanceId,
        gfxId: s.gfxId !== undefined ? s.gfxId : s.GfxId,
        cellId: s.cellId !== undefined ? s.cellId : s.CellId,
        layer: s.layer !== undefined ? s.layer : s.Layer,
        x: s.x !== undefined ? s.x : s.X,
        y: s.y !== undefined ? s.y : s.Y,
        scale: s.scale !== undefined ? s.scale : s.Scale,
        opacity: s.opacity !== undefined ? s.opacity : s.Opacity,
        rotation: s.rotation !== undefined ? s.rotation : s.Rotation,
        flip: s.flip !== undefined ? s.flip : s.Flip,
        priority: s.priority !== undefined ? s.priority : s.Priority,
        visible: s.visible !== undefined ? s.visible : s.Visible
      });
    }
    return out;
  }
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
    if (!appearance) {
      // Legacy AME files (< Sep 2026) were serialized PascalCase; normalize.
      appearance = normalizeAppearance(appearance);
      window.$_customMapAppearance = appearance;
    }
    if (!appearance || !Array.isArray(appearance.instances) || !element) return null;
    var cellId = Number(element.position);
    var gfxId = Number(element.g);
    var layer = Number(element.layer || 0);
    for (var i = 0; i < appearance.instances.length; i++) {
      var item = appearance.instances[i];
    if (Number(item.cellId !== undefined ? item.cellId : item.CellId) !== cellId) continue;
    if (layer && Number(item.layer !== undefined ? item.layer : item.Layer) !== layer) continue;
    if (!layer && Number(item.gfxId !== undefined ? item.gfxId : item.GfxId) !== gfxId) continue;
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
      if (appearance) appearance = normalizeAppearance(appearance);
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

// ── Custom map name banner ────────────────────────────────────────
// Custom maps exported from AME may carry a top-level "name" field in the
// map JSON ("Spawn Cuervok"). Official maps don't, so the banner only ever
// shows for custom maps. Shows once per map load and fades out.
;(function () {
  if (window.$_cuervokMapNameBanner) return;
  window.$_cuervokMapNameBanner = true;
  var chip = null;
  var hideTimer = null;
  function ensureChip() {
    if (chip) return chip;
    chip = document.createElement('div');
    chip.style.cssText = 'position:fixed;top:46px;left:12px;z-index:99998;' +
      'max-width:60vw;padding:6px 14px;border-radius:8px;' +
      'background:rgba(20,16,12,.82);border:1px solid rgba(255,200,80,.45);' +
      'color:#ffe9b8;font:600 15px/1.35 \'Segoe UI\',Arial,sans-serif;' +
      'text-shadow:0 1px 2px rgba(0,0,0,.8);pointer-events:none;' +
      'opacity:0;transition:opacity .4s ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    (document.body || document.documentElement).appendChild(chip);
    return chip;
  }
  function showName(name) {
    try {
      name = String(name || '').trim();
      if (!name) return;
      var el = ensureChip();
      el.textContent = name;
      el.style.opacity = '1';
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(function () { el.style.opacity = '0'; }, 4000);
    } catch (_) {}
  }
  function readName() {
    try {
      var renderer = window.isoEngine && window.isoEngine.mapRenderer;
      var map = renderer && renderer.map;
      if (map && map.name) showName(map.name);
      else if (chip) chip.style.opacity = '0';
    } catch (_) {}
  }
  function watch() {
    try {
      var engine = window.isoEngine;
      if (engine && typeof engine.on === 'function') {
        engine.on('mapLoaded', readName);
        readName();
        return;
      }
    } catch (_) {}
    window.setTimeout(watch, 250);
  }
  watch();
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
  var INFO_BOOSTS_PANEL = 99; // GuildManager.INFO_GUILD_BOOSTS_PANEL
  var CURRENCY_KAMAS = 0;
  var CURRENCY_GOULTINES = 1;

  var content = null;       // WuiDom content of the injected tab
  var lastMsg = null;       // last GuildBoostPanelMessage
  var payCurrency = CURRENCY_KAMAS; // selected currency for purchases
  var requestSeq = 0;       // monotonic idempotency key for mutation requests
  var hookDone = false;

  // ── Official i18n (the client's own dictionaries, module 17) ──────────
  // Every label goes through the game's translator so the tab follows the
  // client language (es/en/fr/...) exactly like the native tabs.  Labels
  // missing from the official dictionaries fall back to Spanish, then to
  // the key itself (the game's own getTextFailover behavior prints the key).
  // ── i18n: idioma del cliente (Config.language / dofus.lang) ──
  var LANG = (function () {
    var l = 'en';
    try {
      var dl = window.dofus && window.dofus.lang;
      if (typeof dl === 'string' && dl) l = dl;
      else if (window.Config && window.Config.language) l = window.Config.language;
    } catch (err) { /* default */ }
    l = String(l).toLowerCase();
    if (l.indexOf('es') === 0) return 'es';
    if (l.indexOf('fr') === 0) return 'fr';
    if (l.indexOf('pt') === 0) return 'pt';
    return 'en';
  })();

  var I18N = {
    en: {
      title:     'GIFT CODES & SUBSCRIPTIONS',
      subtitle:  'Redeem your codes and claim your pending gifts',
      inputHint: 'Enter your code (XXXX-XXXX-XXXX)',
      validate:  'VALIDATE',
      busy:      'Validating…',
      waiting:   'PENDING GIFTS LIST',
      use:       'USE',
      empty:     'You have no pending gifts.',
      loading:   'Loading…',
      delivered: 'Gift delivered! Check your inventory.',
      redeemed:  'Code redeemed! The gift is in the pending list.',
      errors: {
        INVALID:          'Invalid code.',
        INACTIVE:         'This code is disabled.',
        NOT_STARTED:      'This code is not available yet.',
        EXPIRED:          'This code has expired.',
        NO_USES:          'No uses left for this code.',
        ALREADY_REDEEMED: 'You already redeemed this code with this character.',
        PLAYER_LIMIT:     'You reached the per-player redemption limit of this code.',
        DB:               'Temporary server error. Please try again.'
      },
      goultines: 'Goultines'
    },
    es: {
      title:     'CÓDIGOS DE REGALO Y SUSCRIPCIONES',
      subtitle:  'Canjea tus códigos y reclama tus regalos en espera',
      inputHint: 'Introduce tu código (XXXX-XXXX-XXXX)',
      validate:  'VALIDAR',
      busy:      'Validando…',
      waiting:   'LISTA DE REGALOS EN ESPERA',
      use:       'USAR',
      empty:     'No tienes regalos en espera.',
      loading:   'Cargando…',
      delivered: '¡Regalo entregado! Revisa tu inventario.',
      redeemed:  '¡Código canjeado! El regalo está en la lista de espera.',
      errors: {
        INVALID:          'Código no válido.',
        INACTIVE:         'Este código está desactivado.',
        NOT_STARTED:      'Este código aún no está disponible.',
        EXPIRED:          'Este código ha expirado.',
        NO_USES:          'No quedan usos disponibles para este código.',
        ALREADY_REDEEMED: 'Ya canjeaste este código con este personaje.',
        PLAYER_LIMIT:     'Ya alcanzaste el límite de canjes de este código por jugador.',
        DB:               'Error temporal del servidor. Inténtalo de nuevo.'
      },
      goultines: 'Goultinas'
    },
    fr: {
      title:     'CODES CADEAUX ET ABONNEMENTS',
      subtitle:  'Échangez vos codes et réclamez vos cadeaux en attente',
      inputHint: 'Entrez votre code (XXXX-XXXX-XXXX)',
      validate:  'VALIDER',
      busy:      'Validation…',
      waiting:   'LISTE DES CADEAUX EN ATTENTE',
      use:       'UTILISER',
      empty:     'Vous n’avez aucun cadeau en attente.',
      loading:   'Chargement…',
      delivered: 'Cadeau livré ! Vérifiez votre inventaire.',
      redeemed:  'Code échangé ! Le cadeau est dans la liste d’attente.',
      errors: {
        INVALID:          'Code invalide.',
        INACTIVE:         'Ce code est désactivé.',
        NOT_STARTED:      'Ce code n’est pas encore disponible.',
        EXPIRED:          'Ce code a expiré.',
        NO_USES:          'Plus d’utilisations disponibles pour ce code.',
        ALREADY_REDEEMED: 'Vous avez déjà échangé ce code avec ce personnage.',
        PLAYER_LIMIT:     'Vous avez atteint la limite d’échanges de ce code par joueur.',
        DB:               'Erreur temporaire du serveur. Réessayez.'
      },
      goultines: 'Goultines'
    },
    pt: {
      title:     'CÓDIGOS DE PRESENTE E ASSINATURAS',
      subtitle:  'Resgate seus códigos e reivindique seus presentes pendentes',
      inputHint: 'Digite seu código (XXXX-XXXX-XXXX)',
      validate:  'VALIDAR',
      busy:      'Validando…',
      waiting:   'LISTA DE PRESENTES PENDENTES',
      use:       'USAR',
      empty:     'Você não tem presentes pendentes.',
      loading:   'Carregando…',
      delivered: 'Presente entregue! Verifique seu inventário.',
      redeemed:  'Código resgatado! O presente está na lista de espera.',
      errors: {
        INVALID:          'Código inválido.',
        INACTIVE:         'Este código está desativado.',
        NOT_STARTED:      'Este código ainda não está disponível.',
        EXPIRED:          'Este código expirou.',
        NO_USES:          'Não há mais usos disponíveis para este código.',
        ALREADY_REDEEMED: 'Você já resgatou este código com este personagem.',
        PLAYER_LIMIT:     'Você atingiu o limite de resgates deste código por jogador.',
        DB:               'Erro temporário do servidor. Tente novamente.'
      },
      goultines: 'Goultines'
    }
  };

  function txt() { return I18N[LANG] || I18N.en; }

  // ── helpers base del panel (DOM + canal de red) ──
  // el(): constructor DOM minimalista usado por todo el bloque gift.
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // send(): canal del cliente inyectado hacia el servidor de juego.
  // dofus.sendMessage(type, data) produce en el wire
  // {"call":"sendMessage","data":{"type":type,"data":data}}, que es
  // la ruta InterceptFrame del despachador (clases tipadas por nombre).
  function send(type, data) {
    try {
      window.dofus.sendMessage(type, data || {});
    } catch (err) {
      try { console.error('[giftCodes] send(' + type + ') failed', err); } catch (_) {}
    }
  }

  var api = { onRedeemError: function () {} };

  function giftName(g) {
    if (g.kind === 'GOULTINES') return g.goultines + ' ' + (txt().goultines || 'Goultines');
    return (g.quantity && g.quantity > 1 ? g.quantity + '× ' : '') + (g.name || ('item ' + g.itemGid));
  }

  // ── Icono del regalo con los assets OFICIALES del juego ──
  // Rutas (en orden de prueba): 1) /shopimg/{iconId}.png — la MISMA que el
  // shop usa para los tiles de artículos (sirve image/png, probada dentro
  // del juego); 2) /assets/gfx/items/{iconId}.png — la ruta del bundle
  // (getIconUri → ITEM_DIR + iconId + '.png'); 3) goultine.png para la
  // moneda.  Si todas fallan, placeholder discreto + log con las URLs
  // para diagnóstico en la consola del juego.
  function assetsBase() {
    var a = (window.Config && window.Config.assetsUrl) || '../assets/';
    return String(a).replace(/\/+$/, '');
  }
  function iconCandidates(g) {
    var base = assetsBase();
    if (g.kind === 'GOULTINES') return [base + '/gfx/items/goultine.png'];
    if (!g.iconId) return [];
    return [base + '/shopimg/' + g.iconId + '.png', base + '/gfx/items/' + g.iconId + '.png'];
  }
  function buildGiftIcon(g) {
    var box = el('div', 'giftCardIcon');
    var urls = iconCandidates(g);
    if (!urls.length) {
      box.classList.add('fallback');
      box.textContent = g.kind === 'GOULTINES' ? 'G' : '#' + (g.itemGid || '?');
      return box;
    }
    var idx = 0;
    var img = document.createElement('img');
    img.className = 'giftCardIconImg';
    img.alt = '';
    img.addEventListener('error', function () {
      idx++;
      if (idx < urls.length) { img.src = urls[idx]; return; }
      try { img.parentNode && img.parentNode.removeChild(img); } catch (e) {}
      box.classList.add('fallback');
      box.textContent = g.kind === 'GOULTINES' ? 'G' : '#' + (g.itemGid || '?');
      try { console.error('[giftCodes] icono no disponible: ' + urls.join(' | ')); } catch (e) {}
    });
    img.src = urls[0];
    box.appendChild(img);
    return box;
  }

  // Badge with the number of pending gifts on the Goultines shop tab
  function updateBadge(count) {
    try {
      var tab = document.querySelector('.topTabsList .goultineCategory');
      if (!tab) return;
      var badge = tab.querySelector('.giftCodeBadge');
      if (!count || count < 1) {
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        return;
      }
      if (!badge) {
        badge = el('div', 'giftCodeBadge', String(count));
        tab.appendChild(badge);
      } else {
        var changed = badge.textContent !== String(count);
        badge.textContent = String(count);
        if (changed) {
          badge.classList.remove('bump');
          void badge.offsetWidth; // restart animation
          badge.classList.add('bump');
        }
      }
    } catch (err) { /* ignore */ }
  }

  function renderGifts(container, gifts) {
    var n = (gifts && gifts.length) || 0;
    updateBadge(n);
    var old = container.querySelector('.giftCodeList');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var list = el('div', 'giftCodeList');
    var t = txt();
    if (!gifts || !gifts.length) {
      list.appendChild(el('div', 'giftCodeEmpty', t.empty));
    }
    for (var i = 0; gifts && i < gifts.length; i++) {
      (function (g) {
        var card = el('div', 'giftCard');
        card.appendChild(buildGiftIcon(g));
        card.appendChild(el('div', 'giftCardName', giftName(g)));
        var btn = el('div', 'giftCodeBtn', t.use);
        btn.addEventListener('click', function () {
          if (card.$_claiming) return;
          card.$_claiming = true;
          btn.classList.add('busy');
          send('giftClaim', { grantId: g.grantId });
        });
        card.appendChild(btn);
        list.appendChild(card);
      })(gifts[i]);
    }
    container.appendChild(list);
  }

  // Build the panel DOM into a plain container (the overlay that covers
  // the Goultines grid).  All results come from server messages through
  // the api closures below.
  function buildPanelInto(root) {
    if (!root || root.$_giftBuilt) return;
    root.$_giftBuilt = true;
    var t = txt();

    var panel = el('div', 'giftCodePanel');
    root.appendChild(panel);
    api.panel = panel;

    var header = el('div', 'giftCodeHeader');
    header.appendChild(el('div', 'giftCodeIcon'));
    var headTxt = el('div', 'giftCodeHeaderText');
    headTxt.appendChild(el('div', 'giftCodeTitle', t.title));
    headTxt.appendChild(el('div', 'giftCodeSubtitle', t.subtitle));
    header.appendChild(headTxt);
    panel.appendChild(header);

    var row = el('div', 'giftCodeRowInput');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'giftCodeInput';
    input.maxLength = 32;
    input.placeholder = t.inputHint;
    input.spellcheck = false;
    row.appendChild(input);
    var validate = el('div', 'giftCodeValidate', t.validate);
    validate.addEventListener('click', function () {
      if (validate.$_busy) return;
      var code = (input.value || '').trim();
      if (!code) { input.classList.add('shake'); setTimeout(function () { input.classList.remove('shake'); }, 400); return; }
      validate.$_busy = true;
      validate.classList.add('busy');
      validate.textContent = t.busy;
      send('giftCodeRedeem', { code: code });
    });
    row.appendChild(validate);
    panel.appendChild(row);

    var feedback = el('div', 'giftCodeFeedback', '');
    panel.appendChild(feedback);

    panel.appendChild(el('div', 'giftCodeSectionTitle', t.waiting));
    var listWrap = el('div', 'giftCodeListWrap');
    listWrap.appendChild(el('div', 'giftCodeEmpty', t.loading));
    panel.appendChild(listWrap);

    input.addEventListener('keydown', function (ev) {
      if (ev && ev.key === 'Enter' && validate) validate.click();
    });

    api.onRedeemError = function (reason) {
      if (validate) { validate.$_busy = false; validate.classList.remove('busy'); validate.textContent = t.validate; }
      feedback.textContent = t.errors[reason] || (t.errors.DB + ' (' + reason + ')');
      feedback.className = 'giftCodeFeedback err';
      feedback.classList.remove('pop'); void feedback.offsetWidth;
      feedback.classList.add('pop');
    };
    api.resetValidate = function () {
      if (validate) { validate.$_busy = false; validate.classList.remove('busy'); validate.textContent = t.validate; }
    };
    api.refresh = function () { send('giftPendingList', {}); };
    api.renderList = function (gifts) { renderGifts(listWrap, gifts); };
    api.delivered = function () {
      feedback.textContent = t.delivered;
      feedback.className = 'giftCodeFeedback ok';
      feedback.classList.remove('pop'); void feedback.offsetWidth;
      feedback.classList.add('pop');
    };
    api.redeemed = function () {
      feedback.textContent = t.redeemed;
      feedback.className = 'giftCodeFeedback ok';
      feedback.classList.remove('pop'); void feedback.offsetWidth;
      feedback.classList.add('pop');
    };
  }


  // ── Overlay que SUSTITUYE el contenido del tab de Goultinas (556) ──
  // Verdad DOM pura (clases reales del bundle): el tab de la categoría 556
  // se crea como ["tab","goultineCategory"] dentro de .topTabsList, y el
  // área de contenido es la hermana .row2 (viewContainer) donde la rejilla
  // de packs renderiza como .itemsListView._556.  El overlay se muestra
  // SOLO cuando esa vista está activa y en pantalla.
  // La vista de la categoria Goultinas (556) es UNICA en el shop: el
  // bundle RENOMBRA el mismo elemento .itemsListView a "_"+categoryId al
  // abrir cada categoria (setClassNames(["itemsListView","_"+e])).  Funciona
  // igual en el flujo mega (catalog-pages).  Trigger: existe
  // .itemsListView._556 VISIBLE -> el overlay cubre su contenedor (.row2);
  // en cualquier otro estado (otra categoria, tienda cerrada), oculto.
  var overlay = null;            // DOM overlay sobre la vista de packs
  var overlayWasVisible = false; // anti-spam de refresh (solo en transicion)

  function syncOverlay() {
    var view = null;
    var views = document.querySelectorAll('.itemsListView');
    for (var i = 0; i < views.length; i++) {
      if ((' ' + views[i].className + ' ').indexOf('_556') !== -1) { view = views[i]; break; }
    }
    var active = false, vc = null;
    if (view) {
      var st = window.getComputedStyle(view);
      if (st.display !== 'none' && st.visibility !== 'hidden' && view.offsetWidth > 0) {
        active = true;
        vc = view.parentNode;
      }
    }
    if (!vc) {
      if (overlay && overlay.parentNode) overlay.style.display = 'none';
      // CRÍTICO: resetear la marca.  Si queda en true al volver al tab,
      // active === overlayWasVisible y el overlay JAMÁS se vuelve a mostrar
      // ("cargó una sola vez").
      overlayWasVisible = false;
      if (overlay && !overlay.isConnected) overlay = null;
      return;
    }
    try {
      var pos = window.getComputedStyle(vc).position;
      if (pos !== 'absolute' && pos !== 'fixed' && pos !== 'relative') vc.style.position = 'relative';
    } catch (err) { /* keep defaults */ }
    if (!overlay || overlay.parentNode !== vc) {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = el('div', 'giftCodeContent');
      overlay.style.display = 'none';
      vc.appendChild(overlay);
      overlayWasVisible = false;
    }
    if (active === overlayWasVisible) return;
    overlayWasVisible = active;
    overlay.style.display = active ? 'block' : 'none';
    if (active) {
      buildPanelInto(overlay);
      api.refresh();
    }
  }

  function hookMessages() {
    if (window.$_giftMsgsHooked) return;
    var cm = window.dofus && window.dofus.connectionManager;
    if (!cm || typeof cm.on !== 'function') return;
    window.$_giftMsgsHooked = true;

    cm.on('giftCodeRedeemSuccess', function () {
      api.resetValidate && api.resetValidate();
      api.redeemed && api.redeemed();
      api.refresh();
    });
    cm.on('giftCodeRedeemError', function (msg) {
      api.onRedeemError(msg && msg.reason);
    });
    cm.on('giftPendingListSuccess', function (msg) {
      api.renderList && api.renderList((msg && msg.gifts) || []);
    });
    cm.on('giftClaimSuccess', function (msg) {
      api.delivered && api.delivered(msg && msg.grantId);
      api.refresh();
    });
    cm.on('giftClaimError', function (msg) {
      api.refresh();
    });
    // Popup oficial de restauración: el server solo lo responde con
    // regalos en espera; empuja el refresco de la lista.
    cm.on('restoreMysteryBoxSuccess', function () {
      setTimeout(function () { api.refresh(); }, 300);
    });
  }

  // Poll permanente pero barato: el DOM de la tienda solo existe mientras
  // la ventana está abierta (se crea lazy al abrirla y muere al cerrarla)
  // y cada chequeo es una lectura trivial.  El overlay sigue el estado
  // REAL renderizado de la vista de Goultinas, sin adivinar internals.
  var iv = setInterval(function () {
    hookMessages();
    try { syncOverlay(); } catch (err) { /* ignore */ }
  }, 400);
})();
