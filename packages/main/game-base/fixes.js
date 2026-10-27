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
  // Origen del servidor local SIN la ruta /assets: /shopimg vive en la RAIZ
  // del proxy (GET /shopimg/{iconId}.png).  Prependre assetsUrl (…/assets/)
  // producía /assets/shopimg/… (ruta inexistente → cada intento consumesu
  // timeout de red y el icono fallaba; log 17102026).
  function originBase() {
    var s = assetsBase();
    if (/\/assets$/i.test(s)) s = s.replace(/\/assets$/i, '');
    return s;
  }
  function iconCandidates(g) {
    if (g.kind === 'GOULTINES') return [assetsBase() + '/gfx/items/goultine.png'];
    if (!g.iconId) return [];
    return [originBase() + '/shopimg/' + g.iconId + '.png', assetsBase() + '/gfx/items/' + g.iconId + '.png'];
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

// ═══ Cuervok hero UI extras (client-side, features propias del emulador) ═══
// Dos bloques self-contained:
//   1) MULTI-EQUIP BADGE: el bundle pinta la marca "equipado" (icono héroe)
//      contra su ÚNICO _equippedHeroId (el ÚLTIMO EquipHeroResponseMessage).
//      Con multi-héroe VIP los héroes anteriores pierden la marca aunque
//      sigan equipados server-side.  Aquí rastreamos TODOS los ids de
//      héroes equipados (EquipHeroResponseMessage con returnCode 10) y
//      re-aplicamos la clase oficial .equipped en CADA tile de la lista
//      (HeroListTile), resolviendo el id por tile.getHeroId() con fallback
//      por nombre → heroData.getAllHeros().
//   2) OJO DE VISIBILIDAD en el header de la ventana de héroes
//      (equipEntity tab "hero"): tooltip Show/Hide heros, envía
//      HeroVisibilityToggleRequestMessage; el servidor responde
//      HeroVisibilityStateMessage y SOLO cambia los actores de MAPA de los
//      héroes: grupo, combates, seguimiento y el resto del modo héroes
//      siguen funcionando idéntico.
;(function () {
  if (window.$_heroUiExtras) return;
  window.$_heroUiExtras = true;

  /* ════════════════════════════════════════════════════════════════════
     1) MULTI-EQUIP: la marca .equipped en TODOS los héroes equipados
     ════════════════════════════════════════════════════════════════════ */

  var equippedHeroIds = {};   // 'h<id>': true

  function isEquipped(id) { return !!equippedHeroIds['h' + id]; }
  function addEquipped(id) { if (id > 0) equippedHeroIds['h' + id] = true; }

  // GATING (pedido del owner): la función de visibilidad solo está
  // disponible con AL MENOS 1 héroe equipado — sin héroes no hay nada
  // que mostrar/ocultar en el mapa.
  // Tres fuentes (la primera que de un sí gana):
  //   1. Registro local (EquipHeroResponseMessage returnCode 10).
  //   2. Slot oficial del bundle: heroData.getEquippedHeroId() > 0
  //      (el server re-envía el equip de TODOS los héroes al conectar,
  //      HeroResyncManager — este slot siempre queda apuntando al último).
  //   3. Fallback visual: cualquier tile de la lista con clase .equipped.
  function hasEquippedHero() {
    for (var k in equippedHeroIds) { if (equippedHeroIds[k]) return true; }
    try {
      var hd = window.gui && window.gui.playerData && window.gui.playerData.heroData;
      if (hd && typeof hd.getEquippedHeroId === 'function' && hd.getEquippedHeroId() > 0) return true;
    } catch (e) {}
    try {
      var root = getHeroWindowRoot();
      if (root && root.querySelector && root.querySelector('.HeroListTile.equipped')) return true;
    } catch (e) {}
    return false;
  }

  // Id de héroe por tile: las instancias del bundle HeroListTile guardan
  // heroId (tile.getHeroId(), closure del bundle).  Fallback estable:
  // nombre del tile → heroData.getAllHeros().
  var _tileIdCache = {};
  function tileHeroId(tile) {
    try {
      if (typeof tile.getHeroId === 'function') {
        var id = tile.getHeroId();
        if (id > 0) return id;
      }
    } catch (e) {}
    try {
      var nameEl = tile.querySelector('.heroName');
      if (!nameEl) return 0;
      var name = (nameEl.textContent || '').trim();
      if (!name) return 0;
      if (_tileIdCache[name]) return _tileIdCache[name];
      var hd = window.gui && window.gui.playerData && window.gui.playerData.heroData;
      var heroes = hd && hd.getAllHeros && hd.getAllHeros();
      if (heroes) {
        for (var i = 0; i < heroes.length; i++) {
          if (String(heroes[i].name) === name) {
            _tileIdCache[name] = heroes[i].id;
            return heroes[i].id;
          }
        }
      }
    } catch (e) {}
    return 0;
  }

  function refreshTiles() {
    try {
      var root = getHeroWindowRoot();
      if (!root || !root.querySelectorAll) return;
      var tiles = root.querySelectorAll('.HeroListTile');
      for (var i = 0; i < tiles.length; i++) {
        var heroId = tileHeroId(tiles[i]);
        if (!heroId) continue;
        // Marca OFICIAL del bundle (CSS .equipped .tileContainer:before con
        // tiny_icon_hero.png) — toggle de la clase misma, cero CSS custom.
        tiles[i].classList.toggle('equipped', isEquipped(heroId));
      }
    } catch (e) { /* non-fatal */ }
  }

  function scheduleBadgeRefresh() {
    [0, 50, 200, 600].forEach(function (d) { setTimeout(refreshTiles, d); });
  }

  // El bundle reconstruye tiles en listDataRefreshed y solo etiqueta al
  // tile cuyo heroId == getEquippedHeroId(); con multi-equip los demás
  // pierden la clase — el poll (abajo, 400 ms) la re-aplica barato.
  function reconcileBadge() {
    refreshTiles();
  }

  /* ════════════════════════════════════════════════════════════════════
     2) OJO DE VISIBILIDAD
     ════════════════════════════════════════════════════════════════════ */

  var state = {
    visible: true,        // default: mostrar (cada relog vuelve a mostrar)
    initialized: false
  };

  function txt() {
    // Texto del botón, tooltip y alt (pedido del owner).
    return {
      show: 'Show Heros',
      hide: 'Hide Heros',
      titleShow: 'Show Ur heros of the Map',
      titleHide: 'Hide Ur heros of the Map',
      alt: 'Control who sees your heroes on the map'
    };
  }

  function send() {
    try {
      window.dofus.sendMessage('HeroVisibilityToggleRequestMessage', {});
    } catch (err) {
      try { console.error('[heroEye] toggle send failed', err); } catch (_) {}
    }
  }

  // El server usa el canal sendMessage (InterceptFrame); aquí escuchamos
  // por el bus oficial de conexión (mismo patrón que los otros messages).
  function wireServerState() {
    var cm = window.dofus && window.dofus.connectionManager;
    if (!cm || cm.__heroEyeWired) return;
    cm.__heroEyeWired = true;
    try {
      cm.on('HeroVisibilityStateMessage', function (msg) {
        state.visible = !!(msg && msg.visible);
        state.initialized = true;
        updateEye();
      });
    } catch (err) {
      try { console.error('[heroEye] wire failed', err); } catch (_) {}
    }
  }

  // ── estilos del ojo (CSS inyectado, sin ensuciar el bundle) ──
  // Botón verde OFICIAL (.Button .greenButton del bundle) SOLO CON TEXTO
  // (pedido del owner: sin icono) — el texto dinámico Hide/Show Heros
  // indica el estado por sí solo, con los efectos nativos de presión.
  function injectCss() {
    if (document.getElementById('heroEyeCss')) return;
    var css = document.createElement('style');
    css.id = 'heroEyeCss';
    css.textContent = [
    // Botón flex: sin icono, solo el texto centrado (horizontal + vertical).
    '.heroEyeIcon{display:flex;align-items:center;justify-content:center;height:40px;min-height:0;box-sizing:border-box;cursor:pointer;overflow:hidden;}',
    // Label: flujo flex, centrado, letras negras, sin estilos adicionales.
    '.heroEyeIcon .heroEyeLabel{display:inline-block;white-space:nowrap;color:#000;}',
    // Efectos OFICIALES del juego: hover = brillo, active/pressed = el mismo
    // transform scale(.95,.93) que usa .greenButton.pressed del bundle.
    '.heroEyeIcon:hover{filter:brightness(1.08);}',
    '.heroEyeIcon:active,.heroEyeIcon.pressed{transform:scale(.95,.93);-webkit-transform:scale(.95,.93);}'
    ].join("");
    document.head.appendChild(css);
  }

  // Tooltip reutilizando el helper oficial del bundle (addTooltip).
  function attachTooltip(elNode) {
    try {
      var tooltips = null;
      try { tooltips = window.gui && window.gui.richTooltipZone; } catch (e) {}
      var t = txt();
      // addTooltip existe como helper global del bundle (usado por chat/party).
      if (window.gui && typeof window.gui.addTooltip === 'function') {
        window.gui.addTooltip(elNode, function () {
          return state.visible ? t.titleHide : t.alt;
        });
        // Alt/ARIA del botón oficial (pedido del owner).
        try { elNode.setAttribute('alt', t.alt); } catch (_) {}
        return;
      }
      if (window.r !== undefined && window.r.addTooltip) {
        window.r.addTooltip(elNode, function () {
          return state.visible ? t.titleHide : t.alt;
        });
        return;
      }
    } catch (err) { /* fallback nativo abajo */ }
    // Fallback: title nativo (el canvas del cliente no lo pinta, pero es
    // inofensivo y se ve en DOM debugging).
    elNode.title = (state.visible ? t.titleHide : t.alt);
  }

  // ── navegación al container de la ventana de héroes ──
  function findHeroWindow() {
    var w = null;
    try {
      if (window.gui && typeof window.gui.getWindow === 'function') {
        var w0 = window.gui.getWindow('equipEntity');
        // La instancia existe SIEMPRE (creada lazy); solo nos montamos si
        // openState=true (la ventana está visible).
        if (w0 && w0.openState && w0.rootElement) w = w0;
      }
    } catch (err) {}
    if (!w) {
      // getDisplayedWindow no existe en este bundle — iterar children del
      // windowsContainer (por si un fork lo expone distinto).
      try {
        var wc = window.gui && window.gui.windowsContainer;
        // WuiDom guarda los hijos en _childrenList (childrenList sin "_"
        // no existe — era la razón por la que el ojo no se montaba).
        var kids = wc && (wc._childrenList || wc.childrenList || wc.children);
        if (kids) {
          for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (k && k.id === 'equipEntity' && k.openState && k.rootElement) { w = k; break; }
          }
        }
      } catch (err) {}
    }
    return w;
  }

  function getHeroWindowRoot() {
    var w = findHeroWindow();
    return w ? w.rootElement : null;
  }

  var eyeNode = null, eyeLabelNode = null;
  function mountEye() {
    var win = findHeroWindow();
    if (!win || !win.rootElement || !win.rootElement.querySelector) return;
    var root = win.rootElement;
    // Sin héroes equipados el botón no existe (gating del owner).
    if (!hasEquippedHero()) { hideEye(); return; }
    // SOLO la pestaña HERO: el tab companion comparte la misma ventana
    // (equipEntity). El contenido del tab hero es .HeroWindow y el de
    // companion es .CompanionWindow — si no está el hero visible, no
    // montamos nada (así el ojo nunca aparece en la UI de compañeros).
    var heroPane = root.querySelector('.HeroWindow');
    if (!heroPane) { hideEye(); return; }
    injectCss();
    if (eyeNode && eyeNode.isConnected && root.contains(eyeNode)) {
      updateEye();
      return;
    }
    // POSICIÓN (pedida): dentro del cuerpo del tab hero, arriba a la
    // derecha del panel de la LISTA (columna derecha) — no junto al
    // botón de cerrar del header.  El panel es .HeroWindow .rightColumn
    // > .HeroList; si no está montado aún, salimos (el poll reintenta).
    var listPane = heroPane.querySelector('.HeroList');
    if (!listPane) { hideEye(); return; }
    if (eyeNode && eyeNode.isConnected) { try { eyeNode.remove(); } catch (_) {} }
    if (eyeLabelNode && eyeLabelNode.isConnected) { try { eyeLabelNode.remove(); } catch (_) {} }
    eyeLabelNode = null;

    // ── BOTÓN: chrome oficial .Button .greenButton (nine-slice), flex con
    // SOLO el label del texto dinámico (pedido del owner: sin icono).
    // Sin width → shrink-to-fit exacto al texto; align-items +
    // justify-content:center lo centran vertical y horizontalmente.
    eyeNode = document.createElement('div');
    eyeNode.className = 'heroEyeIcon Button greenButton';
    eyeNode.setAttribute('id', 'heroEyeIcon');
    eyeNode.addEventListener('tap', function (e) { e.stopPropagation(); send(); });
    eyeNode.addEventListener('click', function (e) { e.stopPropagation(); send(); });
    var st = eyeNode.style;
    st.setProperty('position', 'absolute', 'important');
    st.setProperty('bottom', '10px', 'important');
    st.setProperty('right', '40%', 'important');
    st.setProperty('height', '40px', 'important');
    st.setProperty('padding', '0', 'important');
    st.setProperty('margin', '0', 'important');
    st.setProperty('background', 'none', 'important');
    st.setProperty('float', 'none', 'important');
    listPane.appendChild(eyeNode);

    // ── TEXTO dinámico DENTRO del botón (pedido del owner): letras
    // NEGRAS, SIN estilos adicionales; flex lo centra vertical solo.
    eyeLabelNode = document.createElement('div');
    eyeLabelNode.className = 'heroEyeLabel';
    var sl = eyeLabelNode.style;
    sl.setProperty('margin', '0 10px', 'important');
    // Letras NEGRAS (pedido del owner).
    sl.setProperty('color', '#212020', 'important');
    eyeNode.appendChild(eyeLabelNode);
    attachTooltip(eyeNode);
    updateEye();
  }

  // La ventana/tab se cerró: desmontar el ojo para que no quede huérfano.
  function hideEye() {
    if (eyeNode && eyeNode.isConnected) { try { eyeNode.remove(); } catch (_) {} }
    if (eyeLabelNode && eyeLabelNode.isConnected) { try { eyeLabelNode.remove(); } catch (_) {} }
  }

  function updateEye() {
    if (!eyeNode) return;
    var t = txt();
    // TEXTO dinámico: opción activa (héroes visibles) → "Hide Heros";
    // opción inactiva (ocultos) → "Show Heros".  Sin icono: el texto es
    // la única representación visual del estado (pedido del owner).
    if (eyeLabelNode) eyeLabelNode.textContent = state.visible ? t.hide : t.show;
    eyeNode.title = t.alt;
  }

  // Poll barato: la ventana se crea/destruye lazy, el DOM cambia al abrir
  // la pestaña de héroes (misma estrategia usada por el bloque gift codes).
  function wireProtocol() {
    var cm = window.dofus && window.dofus.connectionManager;
    if (!cm || cm.__heroExtrasWire) return;
    cm.__heroExtrasWire = true;
    try {
      cm.on('EquipHeroResponseMessage', function (m) {
        try {
          if (!m || m.returnCode !== 10) return;   // HERO_SUCCESS oficial
          addEquipped(m.additionalEntityId);
          scheduleBadgeRefresh();
        } catch (e) { /* non-fatal */ }
      });
      // Unequip no trae id (protocolo oficial); el bundle re-renderiza la
      // lista y el reconcile re-aplica la marca SOLO en los aún equipados.
      cm.on('UnequipAdditionalEntityResponseMessage', function (m) {
        try {
          if (m && m.returnCode === 10) scheduleBadgeRefresh();
        } catch (e) { /* non-fatal */ }
      });
      cm.on('HeroesListResponseMessage', scheduleBadgeRefresh);
    } catch (err) {
      try { console.error('[heroExtras] wire failed', err); } catch (_) {}
    }
  }

  var iv = setInterval(function () {
    wireProtocol();
    wireServerState();
    try { mountEye(); } catch (err) { /* ignore */ }
    try { reconcileBadge(); } catch (err) { /* ignore */ }
  }, 400);
})();

// ── Sprite highlight crash guard ────────────────────────────────────────
// Race del engine: refreshAnimation() (script.js:437) llama
// _updateSpriteHighlight() sin chequear que el batch del mapa ya creó su
// vertex buffer.  Si un sprite entra a _updatedSprites antes de finalize()
// (setTexture durante la carga del mapa), _longView sigue null y
// _longView.subarray lanza "TypeError: Cannot read properties of null
// (reading 'subarray')" — y el loop de _refreshPrecisionRendering lo repite
// cada frame.  Guard: envolver el prototype del batch (se alcanza desde
// mapRenderer.graphics) y no-op cuando el buffer no existe aún; finalize()
// redibuja todo de todas formas.
;(function () {
  if (window.$_spriteHighlightGuard) return;
  window.$_spriteHighlightGuard = true;

  var guardTimer = setInterval(function () {
    try {
      var mr = window.isoEngine && window.isoEngine.mapRenderer;
      var gs = mr && mr.graphics;
      if (!gs) return;
      for (var i = 0; i < gs.length; i++) {
        var g = gs[i];
        if (!g || !g._updatedSprites) continue;
        var proto = Object.getPrototypeOf(g);
        if (!proto || typeof proto._updateSpriteHighlight !== 'function') continue;
        if (proto.__cuervokHighlightGuard) { clearInterval(guardTimer); return; }
        proto.__cuervokHighlightGuard = true;
        var orig = proto._updateSpriteHighlight;
        proto._updateSpriteHighlight = function (sprite) {
          try {
            if (!this._longView || !this._vertexBufferCreated) return;
            return orig.call(this, sprite);
          } catch (err) { /* un frame perdido < crash del render loop */ }
        };
        clearInterval(guardTimer);
        return;
      }
    } catch (err) { /* retry en el próximo tick */ }
  }, 500);
})();
// ── $_jobsDiag_v1 — sonda de diagnóstico SOLO-CONSOLE ───────────────────
// Contexto: la ventana de Oficios muestra los slots vacíos aunque el proxy
// sirve gfx/jobs/{1..40}.png con 200 image/png y los items sí cargan.  Esta
// sonda (no toca UI) remite a game-console.log el estado REAL del runtime:
//   • Config.assetsUrl/uiUrl, wizAssets presente
//   • jobOriginalOrder + iconId de los 6 primeros oficios
//   • resultado crudo de assetPreloader.preloadImages(gfx/jobs/…)
//   • backgroundImage aplicado a cada jobIcon tras _updateJobIcons()
// Marca única: se auto-desactiva si liberas con doble llamada.
;(function () {
  if (window.$_jobsDiag_v1) return;
  window.$_jobsDiag_v1 = true;
  var tries = 0, pend = 0, pendTries = 0;
  var timer = setInterval(function () {
    var jd = window.gui && window.gui.playerData && window.gui.playerData.jobs;
    if (jd && jd.jobOriginalOrder && jd.jobOriginalOrder.length) {
      clearInterval(timer);
      // el panel puede abrirse después del login: si no está abierto, reintentar
      pendTries = 0;
      var rep = function () { if (diag() === false && ++pendTries < 15) pend = setTimeout(rep, 4000); };
      pend = setTimeout(rep, 12000);
    } else if (++tries > 600) { clearInterval(timer); console.warn('[jobsDiag] jobs data never appeared'); }
  }, 200);

  function bgOf(w) {
    try {
      var ic = w && w.jobButtons && w.jobButtons[0] && w.jobButtons[0].getChild('jobIcon');
      var root = ic && ic.icon && ic.icon.rootElement;
      return root ? root.style.backgroundImage : '(no root)';
    } catch (e) { return '(err ' + (e && e.message) + ')'; }
  }
  function diag() {
    try {
      var w0 = null;
      try { w0 = window.gui.getWindow('jobs'); } catch (e0) {}
      if (!w0 && window.gui && window.gui.windowsContainer) {
        var kc = window.gui.windowsContainer;
        var kk = kc && (kc._childrenList || kc.childrenList || kc.children);
        if (kk) for (var j0 = 0; j0 < kk.length; j0++) if (kk[j0] && kk[j0].id === 'jobs') { w0 = kk[j0]; break; }
      }
      if (!w0) { console.warn('[jobsDiag] panel aún cerrado (reintentando)'); return false; }
      var cfg = window.Config || {};
      console.warn('[jobsDiag] assetsUrl=' + cfg.assetsUrl + ' uiUrl=' + cfg.uiUrl + ' wizAssets=' + (!!window.wizAssets));
      var jd = window.gui.playerData.jobs || {};
      var order = jd.jobOriginalOrder || [];
      console.warn('[jobsDiag] order len=' + order.length + ' first12=' + order.slice(0, 12).join(','));
      var list = jd.list || {};
      var out = [], n = 0;
      for (var k in list) {
        if (n++ >= 8) break;
        var it = list[k];
        out.push(k + ':icon=' + (it.info && it.info.iconId != null ? it.info.iconId : 'MISSING') + ',spec=' + (it.info && it.info.specializationOfId != null ? it.info.specializationOfId : '-'));
      }
      console.warn('[jobsDiag] list ' + Object.keys(list).length + ' → ' + out.join(' | '));
      var w = w0;
      console.warn('[jobsDiag] panel wrapper jobButtons=' + (w.jobButtons || []).length + ' mark=' + (w._jobsPatchMark || '(none)') + ' hasJobMap=' + (!!w.jobMap));
      console.warn('[jobsDiag] slot0 backgroundImage ANTES de recargar: ' + bgOf(w));
      var ap = window.assetPreloader;
      if (ap && ap.preloadImages) {
        ap.preloadImages(['gfx/jobs/1.png', 'gfx/jobs/13.png', 'gfx/jobs/30.png'], function (res) {
          console.warn('[jobsDiag] preloadImages res=' + JSON.stringify(res));
          // estado del slot 0 tras una pasada de _updateJobIcons
          if (w._updateJobIcons) { w._updateJobIcons(); console.warn('[jobsDiag] slot0 backgroundImage tras _updateJobIcons: ' + bgOf(w)); }
        });
      } else console.warn('[jobsDiag] assetPreloader.preloadImages AUSENTE');
    } catch (e) { console.warn('[jobsDiag] error ' + (e && e.message)); }
  }
})();

// ── $_jobsIconForce_v2 — fuerza el icono de cada slot de Oficios ─────────────
// v2 (2026-10-27): v1 abandonaba el escaneo en el PRIMER avistamiento de la
// ventana 'jobs' (clearInterval inmediato). Si esa primera pasada ocurría
// antes de que existieran casillas con jobId y _updateJobIcons (wrapper
// registrado pero sin datos, o método aún no montado), el hook no eficaba y
// el pintado nunca volvía a intentarse — sin log de [jobsIconForce] EXACTO en
// game-console.log. Ahora:
//   • el escaneo no se abandona hasta que la ventana esté HACKEADA y al
//     menos una casilla tenga jobId;
//   • tras el primer pintado queda un repintado cada 8 s (recupera el estilo
//     si el juego lo limpia en un refresco de la ventana);
//   • cada cambio de estado se reporta una vez por sesión en game-console.log
//     (marcador [jobsIconForce]) — casillas sin jobId, iconId fuera de
//     rango 1..40 (→ el caso "especialidad sin icono en el CDN"), o la
//     pasada que repinta/sostiene los slots;
//   • vacía el texto "Niv. X" de cada casilla ($_jobsIconsClean_v1 lo esconde
//     por CSS; el widget también queda sin texto aunque el juego lo repinte:
//     texts ocultos/mal posicionados según lo pedido).
;(function () {
  if (window.$_jobsIconForce_v2) return
  window.$_jobsIconForce_v2 = true

  function assetsBase() {
    var u = (window.Config && window.Config.assetsUrl) || 'http://127.0.0.1:8765/assets/'
    return String(u).replace(/\/+$/, '')
  }

  function findWindow() {
    var w = null
    try { w = window.gui && window.gui.getWindow && window.gui.getWindow('jobs') } catch (e) {}
    if (!w && window.gui && window.gui.windowsContainer) {
      var kids = window.gui.windowsContainer._childrenList || window.gui.windowsContainer.childrenList || window.gui.windowsContainer.children
      if (kids) for (var i = 0; i < kids.length; i++) if (kids[i] && kids[i].id === 'jobs') { w = kids[i]; break }
    }
    return w
  }

  function iconChild(b) {
    try { var c = b.getChild && b.getChild('jobIcon'); if (c) return c } catch (e) {}
    try { return b.itemSlot || (b.children && b.children.jobIcon) || null } catch (e2) {}
    return null
  }

  function rootOf(icon) {
    try { if (icon && icon.icon && icon.icon.rootElement) return icon.icon.rootElement } catch (e) {}
    return null
  }

  function paint(w) {
    if (!w || !w.jobMap) return { checked: 0, painted: 0, noJobId: 0, badIcon: [] }
    var arrs = [w.jobButtons, w.jobSelectButtons, w.jobSelectSpecialButtons]
    var base = assetsBase()
    var st = { checked: 0, painted: 0, noJobId: 0, badIcon: [] }
    for (var ai = 0; ai < arrs.length; ai++) {
      var arr = arrs[ai] || []
      for (var bi = 0; bi < arr.length; bi++) {
        var b = arr[bi]
        if (!b) continue
        if (!b.jobId) { st.noJobId++; continue }
        var entry = w.jobMap[b.jobId]
        var info = entry && entry.info
        var ic = info ? info.iconId : null
        if (!(ic >= 1 && ic <= 40)) {
          if (st.badIcon.length < 8) st.badIcon.push(b.jobId + ':' + (ic == null ? 'null' : ic))
          continue
        }
        var root = rootOf(iconChild(b))
        if (!root) continue
        st.checked++
        var cur = root.style.backgroundImage || ''
        if (cur.indexOf('gfx/jobs/') < 0) {
          root.style.backgroundImage = 'url("' + base + '/gfx/jobs/' + ic + '.png")'
          st.painted++
        }
        // Texto de nivel fuera: el CSS ($_jobsIconsClean_v1) lo esconde y
        // aquí se vacía el widget también (idempotente).
        try {
          var lv = b.getChild && b.getChild('level')
          if (lv && lv.rootElement && (lv.rootElement.textContent || '').trim() && typeof lv.setText === 'function') lv.setText('')
        } catch (e3) {}
      }
    }
    return st
  }

  function hook(w) {
    if (!w || w.$_iconForceHooked) return true
    if (typeof w._updateJobIcons !== 'function') return false
    var orig = w._updateJobIcons
    w.$_iconForceHooked = true
    w._updateJobIcons = function () {
      var r = orig.apply(this, arguments)
      try { paint(this) } catch (e) { console.warn('[jobsIconForce] err ' + (e && e.message)) }
      return r
    }
    console.warn('[jobsIconForce] hook montado sobre _updateJobIcons')
    return true
  }

  var lastSig = ''
  function report(st) {
    var bits = []
    if (st.checked && st.painted) bits.push('slots=' + st.checked + ' repintados=' + st.painted)
    else if (st.checked) bits.push('slots=' + st.checked + ' con imagen actual')
    if (st.noJobId) bits.push('casillas sin jobId=' + st.noJobId)
    if (st.badIcon.length) bits.push('iconId fuera de rango 1..40 → ' + st.badIcon.join(','))
    var sig = bits.join(' | ')
    if (!sig || sig === lastSig) return
    lastSig = sig
    console.warn('[jobsIconForce] ' + sig)
  }

  var ready = false
  var timer = setInterval(function () {
    try {
      var w = findWindow()
      if (!w) return
      if (!w.$_iconForceHooked && !hook(w)) return
      var st = paint(w)
      report(st)
      if (st.checked > 0) {
        ready = true
        clearInterval(timer)
        // Repintado de sostén: el juego puede limpiar estilos al refrescar
        // la ventana; cada 8 s restablece los iconos y el estado del texto.
        setInterval(function () {
          try { var w2 = findWindow(); if (w2) paint(w2) } catch (e) {}
        }, 8000)
      }
    } catch (e) { console.warn('[jobsIconForce] scan err ' + (e && e.message)) }
  }, 1500)
})()

// ── $_jobsIconsPrewarm_v1 — calienta los PNG de Oficios en el arranque ──────
// Síntoma: el PRIMER aperturar de la ventana de Oficios pinta las casillas
// vacías; al reeconomizarla salen todos los iconos. Causa: los PNG
// gfx/jobs/{1..40}.png solo se piden cuando el panel se abre por primera vez,
// y mientras el HTTP del CDN los baja (proxy local → origen) el slot queda
// sin imagen. Solución: precargar los 40 PNG desde el arranque (mismo origen
// que usa _jobsIconForce al repintar), de forma que cuando el usuario abra
// el panel ya estén en la caché HTTP/memoria y el primer pintado sea
// inmediato. Idempotente (se desactiva tras terminar), con reporte único
// por sesión y tope de reintento. Marca visible: [jobsPrewarm].
;(function () {
  if (window.$_jobsIconsPrewarm_v1) return
  window.$_jobsIconsPrewarm_v1 = true

  function assetsBase() {
    var u = (window.Config && window.Config.assetsUrl) || 'http://127.0.0.1:8765/assets/'
    return String(u).replace(/\/+$/, '')
  }

  var tries = 0, done = false, started = false
  var timer = setInterval(function () {
    if (done) { clearInterval(timer); return }
    var base = assetsBase()
    if (!base) { if (++tries > 600) { clearInterval(timer); console.warn('[jobsPrewarm] sin base de assets — cancelado') } return }
    if (!started) {
      started = true
      var imgs = []
      for (var i = 1; i <= 40; i++) {
        var im = new Image()
        im.onload = im.onerror = (function (mm) { return function () { mm.__done = true } })(im)
        im.src = base + '/gfx/jobs/' + i + '.png'
        imgs.push(im)
      }
      // Cache de widgets vía assetPreloader cuando exista (mismo pipeline que
      // usa el juego al pintar casillas).
      try {
        var ap = window.assetPreloader
        if (ap && typeof ap.preloadImages === 'function') {
          var files = []
          for (var j = 1; j <= 40; j++) files.push('/gfx/jobs/' + j + '.png')
          ap.preloadImages(files, function (res) {
            try { console.warn('[jobsPrewarm] preloadImages listo ' + JSON.stringify(res)) } catch (e2) { console.warn('[jobsPrewarm] preloadImages listo') }
          })
        }
      } catch (e3) { console.warn('[jobsPrewarm] preloadImages err ' + (e3 && e3.message)) }
    }
    var ready = 0, errs = 0, pend = 0
    for (var k = 0; k < imgs.length; k++) {
      if (imgs[k].__done) { if (imgs[k].naturalWidth > 0) ready++; else errs++ }
      else pend++
    }
    if (pend === 0 && (started)) {
      done = true
      clearInterval(timer)
      console.warn('[jobsPrewarm] Oficios precargados: ok=' + ready + ' fallos=' + errs + ' de 40')
    } else if (++tries > 600) {
      done = true
      clearInterval(timer)
      console.warn('[jobsPrewarm] timeout (200 s): ok=' + ready + ' fallos=' + errs + ' pendientes=' + pend)
    }
  }, 500)

})()
