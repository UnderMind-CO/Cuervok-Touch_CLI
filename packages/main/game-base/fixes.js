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
  if (window.$_guildBoostTabInjected) return;
  window.$_guildBoostTabInjected = true;

  var TAB_ID = 'donationBoosts';
  var INFO_BOOSTS_PANEL = 99; // GuildManager.INFO_GUILD_BOOSTS_PANEL
  var CURRENCY_KAMAS = 0;
  var CURRENCY_GOULTINES = 1;

  var content = null;       // WuiDom content of the injected tab
  var lastMsg = null;       // last GuildBoostPanelMessage
  var payCurrency = CURRENCY_KAMAS; // selected currency for purchases
  var requestSeq = 0;       // monotonic idempotency key for mutation requests
  var hookDone = false;

  // ── i18n: idioma del cliente (mismo patrón que la ventana CuervoDex) ──
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

  // Custom strings sin clave oficial: tabla propia por idioma. Las claves
  // ui.* oficiales se intentan primero vía T() y caen aquí como fallback.
  var I18N = {
    en: {
      treasury: 'Guild Treasury', yourFunds: 'Your funds', donate: 'Donate',
      donateTo: 'Donate to the guild', payWith: 'Pay with:', boosts: 'Guild Boosts',
      effect: 'Effect', level: 'Level', price: 'Price', buy: 'Buy', max: 'Max',
      cancel: 'Cancel', confirm: 'Confirm', amount: 'Quantity', available: 'Available',
      lastDonations: 'Recent donations', noDonations: 'No donations yet.',
      noBoostData: 'No boost data.', loading: 'Loading…',
      kamas: 'Kamas', goultines: 'Goultines', onlyG: 'Goultines only',
      noFunds: 'Insufficient guild funds',
      memberXp: 'Member XP contribution',
      statAP: 'AP', statMP: 'MP', statRange: 'Range', statSummons: 'Summons',
      statDamagePct: 'Final damage', statVitality: 'Vitality', statAgility: 'Agility',
      statChance: 'Chance', statStrength: 'Strength', statIntelligence: 'Intelligence',
      statWisdom: 'Wisdom', statProspection: 'Prospecting'
    },
    es: {
      treasury: 'Tesorería', yourFunds: 'Tus fondos', donate: 'Donar',
      donateTo: 'Donar al gremio', payWith: 'Pagar con:', boosts: 'Boosts del gremio',
      effect: 'Efecto', level: 'Nivel', price: 'Precio', buy: 'Comprar', max: 'Máx',
      cancel: 'Cancelar', confirm: 'Confirmar', amount: 'Cantidad', available: 'Disponible',
      lastDonations: 'Últimos donativos', noDonations: 'Todavía no hay donativos.',
      noBoostData: 'Sin datos de boosts.', loading: 'Cargando…',
      kamas: 'Kamas', goultines: 'Goultines', onlyG: 'Solo Goultines',
      noFunds: 'Fondos insuficientes en el gremio',
      memberXp: 'XP aportada por miembro',
      statAP: 'PA', statMP: 'PM', statRange: 'Alcance', statSummons: 'Invocaciones',
      statDamagePct: 'Daños finales', statVitality: 'Vitalidad', statAgility: 'Agilidad',
      statChance: 'Suerte', statStrength: 'Fuerza', statIntelligence: 'Inteligencia',
      statWisdom: 'Sabiduría', statProspection: 'Prospección'
    },
    fr: {
      treasury: 'Trésorerie', yourFunds: 'Vos fonds', donate: 'Donner',
      donateTo: 'Donner à la guilde', payWith: 'Payer avec :', boosts: 'Boosts de guilde',
      effect: 'Effet', level: 'Niveau', price: 'Prix', buy: 'Acheter', max: 'Max',
      cancel: 'Annuler', confirm: 'Confirmer', amount: 'Quantité', available: 'Disponible',
      lastDonations: 'Derniers dons', noDonations: 'Pas encore de dons.',
      noBoostData: 'Aucune donnée de boost.', loading: 'Chargement…',
      kamas: 'Kamas', goultines: 'Goultines', onlyG: 'Goultines uniquement',
      noFunds: 'Fonds de guilde insuffisants',
      memberXp: 'XP apportée par membre',
      statAP: 'PA', statMP: 'PM', statRange: 'Portée', statSummons: 'Invocations',
      statDamagePct: 'Dégâts finaux', statVitality: 'Vitalité', statAgility: 'Agilité',
      statChance: 'Chance', statStrength: 'Force', statIntelligence: 'Intelligence',
      statWisdom: 'Sagesse', statProspection: 'Prospection'
    },
    pt: {
      treasury: 'Tesouraria', yourFunds: 'Seus fundos', donate: 'Doar',
      donateTo: 'Doar à guilda', payWith: 'Pagar com:', boosts: 'Boosts da guilda',
      effect: 'Efeito', level: 'Nível', price: 'Preço', buy: 'Comprar', max: 'Máx',
      cancel: 'Cancelar', confirm: 'Confirmar', amount: 'Quantidade', available: 'Disponível',
      lastDonations: 'Últimos donativos', noDonations: 'Ainda não há donativos.',
      noBoostData: 'Sem dados de boosts.', loading: 'Carregando…',
      kamas: 'Kamas', goultines: 'Goultines', onlyG: 'Apenas Goultines',
      noFunds: 'Fundos insuficientes na guilda',
      memberXp: 'XP contribuída por membro',
      statAP: 'PA', statMP: 'PM', statRange: 'Alcance', statSummons: 'Invocações',
      statDamagePct: 'Dano final', statVitality: 'Vitalidade', statAgility: 'Agilidade',
      statChance: 'Sorte', statStrength: 'Força', statIntelligence: 'Inteligência',
      statWisdom: 'Sabedoria', statProspection: 'Prospecção'
    }
  };
  function txt() { return I18N[LANG] || I18N.en; }

  // ── Official i18n (the client's own dictionaries, module 17) ──────────
  // Every label goes through the game's translator so the tab follows the
  // client language (es/en/fr/...) exactly like the native tabs.  Labels
  // missing from the official dictionaries fall back to the localized
  // I18N table above, then to the key itself (the game's own
  // getTextFailover behavior prints the key).
  function T(key, fallback) {
    try {
      // Gate on hasText FIRST: getText on a missing key triggers the
      // game's getTextFailover console error ("no failover getText was
      // found for <key>") — hasText answers silently.  When the i18n
      // module has no hasText, keep the legacy direct-getText behavior.
      var hasFn = !!(window.$_i18nModule && typeof window.$_i18nModule.hasText === 'function');
      if (window.$_i18nModule && typeof window.$_i18nModule.getText === 'function' &&
          (!hasFn || TExists(key))) {
        var out = window.$_i18nModule.getText(key);
        // The game's own failover prints "<lang>[?<key>]" (chaseText mode
        // prints "<lang>[<key>]") — treat both as "missing" so our Spanish
        // fallback kicks in instead of showing debug keys.
        if (out && out.indexOf('[?') !== 0 && /^[a-z]{2,3}\[/.exec(out) === null) return out;
      }
    } catch (err) { /* dictionary not ready — fall through */ }
    return fallback !== undefined ? fallback : key;
  }
  function TExists(key) {
    try {
      return Boolean(window.$_i18nModule && typeof window.$_i18nModule.hasText === 'function' && window.$_i18nModule.hasText(key));
    } catch (err) { return false; }
  }
  // Official short level suffix ("lvl"); graceful fallback.
  function LVL() { return TExists('ui.common.short.level') ? T('ui.common.short.level') : 'lvl'; }
  // Official kamas short unit ("K") / goultines label from the dictionaries.
  function KAMA_UNIT() { return TExists('ui.common.short.kama') ? T('ui.common.short.kama') : 'K'; }
  function GOULTINE_UNIT() { return TExists('ui.common.goultines') ? T('ui.common.goultines') : txt().goultines; }
  // Locale-aware number grouping via the game's own formatter
  // (ui.common.numberSeparator — matches the language).
  function fmt(n) {
    n = Math.round(Number(n) || 0);
    try {
      if (window.$_i18nModule && typeof window.$_i18nModule.getText === 'function' &&
          TExists('ui.common.numberSeparator')) {
        var sep = T('ui.common.numberSeparator');
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      }
    } catch (err) { /* fall through */ }
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // ── Boost label localization (server statKey → official i18n keys) ───
  // The server sends statKey + perLevel; the row renders in the player's
  // language using the SAME keys the official characteristics UI uses.
  // AP/MP use the official abbreviations ui.common.ap / ui.common.mp.
  var STAT_KEYS = {
    actionPoints:              { name: function () { return T('ui.common.ap', txt().statAP); },                  pct: false },
    movementPoints:            { name: function () { return T('ui.common.mp', txt().statMP); },                  pct: false },
    range:                     { name: function () { return T('ui.common.range', txt().statRange); },            pct: false },
    summonableCreaturesBoost:  { name: function () { return T('ui.common.summonableCreatures', txt().statSummons); }, pct: false },
    permanentDamagePercent:    { name: function () { return T('ui.stats.damagesBonusPercent', txt().statDamagePct); }, pct: true  },
    vitality:                  { name: function () { return T('ui.stats.vitality', txt().statVitality); },       pct: false },
    agility:                   { name: function () { return T('ui.stats.agility', txt().statAgility); },         pct: false },
    chance:                    { name: function () { return T('ui.stats.chance', txt().statChance); },           pct: false },
    strength:                  { name: function () { return T('ui.stats.strength', txt().statStrength); },       pct: false },
    intelligence:              { name: function () { return T('ui.stats.intelligence', txt().statIntelligence); }, pct: false },
    wisdom:                    { name: function () { return T('ui.stats.wisdom', txt().statWisdom); },           pct: false },
    prospecting:               { name: function () { return T('ui.stats.prospection', txt().statProspection); }, pct: false }
  };
  // Localized "<perLevel>x <Stat>" line for a boost row (Spanish fallback =
  // the server's own label/effect when the key or statKey is unknown).
  function boostName(b) {
    var def = b && b.statKey && STAT_KEYS[b.statKey];
    if (!def) return b.label || '';
    var per = Math.max(1, b.perLevel || 1);
    return per + ' ' + def.name();
  }
  function boostEffect(b) {
    var def = b && b.statKey && STAT_KEYS[b.statKey];
    if (!def) return b.effect || '';
    var per = Math.max(1, b.perLevel || 1);
    return '+' + per + (def.pct ? '%' : '') + ' ' + def.name();
  }

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
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

  // ── Localized strings (official keys → I18N table fallback) ──────────
  function STR() {
    var s = txt();
    return {
      // LITERAL label (user rule): the official ui.social.guildBoosts key
      // resolves to "Personalización" in the bundle dictionaries — the tab
      // must keep its "Boost Guild" identity in every language.
      tabLabel:      'Boost Guild',
      treasury:      T('ui.social.guildTreasury', s.treasury),
      yourFunds:     T('ui.social.guildYourFunds', s.yourFunds),
      donate:        T('ui.social.guildDonate', s.donate),
      donateTo:      T('ui.social.guildDonateTo', s.donateTo),
      payWith:       T('ui.social.guildPayWith', s.payWith),
      boosts:        T('ui.social.guildBoostsPanel', s.boosts),
      effect:        T('ui.common.effect', s.effect),
      level:         T('ui.common.level', s.level),
      price:         T('ui.common.price', s.price),
      buy:           T('ui.common.buy', s.buy),
      max:           T('ui.common.max', s.max),
      cancel:        T('ui.common.cancel', s.cancel),
      confirm:       T('ui.common.confirm', s.confirm),
      amount:        T('ui.common.quantity', s.amount),
      available:     T('ui.common.available', s.available),
      lastDonations: T('ui.social.guildLastDonations', s.lastDonations),
      noDonations:   T('ui.social.guildNoDonations', s.noDonations),
      noBoostData:   T('ui.social.guildNoBoosts', s.noBoostData),
      loading:       T('ui.common.loading', s.loading),
      kamas:         T('ui.common.kamas', s.kamas),
      goultines:     GOULTINE_UNIT(),
      onlyG:         TExists('ui.common.onlyGoultines') ? T('ui.common.onlyGoultines') : s.onlyG,
      noFunds:       s.noFunds,
      memberXp:       s.memberXp
    };
  }
  // "Goultines-only" tag for combat-changing boosts (PA/MP/range/summons/%
  // final damage): official key when the dictionaries carry one, otherwise
  // the localized I18N table.
  function ONLY_G() {
    return STR().onlyG;
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
    guildWin.tabs.addTab(STR().tabLabel, content, TAB_ID);

    content.on('open', function () {
      requestPanel();
      if (lastMsg) renderPanel(lastMsg);
    });

    // Initial placeholder
    content.rootElement.appendChild(el('div', 'guildBoostHint', STR().loading));
    requestPanel();
  }

  // ── Renderers ────────────────────────────────────────────────────────

  function renderPanel(msg) {
    lastMsg = msg;
    if (!content || !content.rootElement) return;
    var s = STR();
    var root = content.rootElement;
    root.innerHTML = '';

    // Treasury header + donation button (official greenButton chrome)
    var treasury = el('div', 'guildBoostTreasury');
    treasury.appendChild(el('div', 'guildBoostSectionTitle', s.treasury));

    var balances = el('div', 'guildBoostBalances');
    balances.appendChild(el('div', 'guildBoostBalance', s.kamas + ': ' + fmt(msg.treasuryKamas)));
    balances.appendChild(el('div', 'guildBoostBalance goultines', s.goultines + ': ' + fmt(msg.treasuryGoultines)));
    treasury.appendChild(balances);

    treasury.appendChild(el('div', 'guildBoostMyWallets',
      s.yourFunds + ' — ' + s.kamas + ': ' + fmt(msg.myKamas) + ' · ' + s.goultines + ': ' + fmt(msg.myGoultines)));

    var donateBtn = el('div', 'guildBoostBtn donate', s.donate);
    donateBtn.addEventListener('click', function () { openDonateModal(msg); });
    treasury.appendChild(donateBtn);
    root.appendChild(treasury);

    // Currency toggle for purchases
    var payRow = el('div', 'guildBoostPayRow');
    payRow.appendChild(el('span', 'guildBoostPayLabel', s.payWith));
    var kBtn = el('div', 'guildBoostBtn mini' + (payCurrency === CURRENCY_KAMAS ? ' on' : ''), s.kamas);
    var gBtn = el('div', 'guildBoostBtn mini' + (payCurrency === CURRENCY_GOULTINES ? ' on' : ''), s.goultines);
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
    boosts.appendChild(el('div', 'guildBoostSectionTitle', s.boosts));

    var header = el('div', 'guildBoostRow header');
    header.appendChild(el('div', 'colEffect', s.effect));
    header.appendChild(el('div', 'colLevel', s.level));
    header.appendChild(el('div', 'colPrice', s.price));
    header.appendChild(el('div', 'colBuy', ''));
    boosts.appendChild(header);

    var boostsArr = msg.boosts || [];
    if (!boostsArr.length) {
      boosts.appendChild(el('div', 'guildBoostHint', s.noBoostData));
    }
    for (var i = 0; i < boostsArr.length; i++) {
      var b = boostsArr[i];
      var row = el('div', 'guildBoostRow');

      var effectCol = el('div', 'colEffect');
      effectCol.appendChild(el('div', 'guildBoostName', boostName(b)));
      effectCol.appendChild(el('div', 'guildBoostEffect', boostEffect(b)));
      row.appendChild(effectCol);

      var lvl = el('div', 'colLevel');
      // Level column shows CURRENCY POINTS (current×perLevel / max×perLevel):
      // vitality buys +5 per purchase, so the bar tracks the actual bonus.
      var per = Math.max(1, b.perLevel || 1);
      lvl.appendChild(el('div', 'guildBoostLevel', (b.current * per) + ' / ' + (b.max * per)));
      var bar = el('div', 'guildBoostBar');
      var fill = el('div', 'guildBoostBarFill');
      fill.style.width = Math.min(100, Math.round((b.current / b.max) * 100)) + '%';
      bar.appendChild(fill);
      lvl.appendChild(bar);
      row.appendChild(lvl);

      var priceCol = el('div', 'colPrice');
      var gPrice = fmt(b.goultinesPrice) + ' G';
      if (b.goultinesOnly) {
        // Goultines-exclusive boost (server-enforced): the row shows the
        // goultines price plus the localized "only goultines" tag — never a
        // kamas price, regardless of the pay-with toggle.
        priceCol.appendChild(el('div', 'guildBoostPrice', gPrice));
        priceCol.appendChild(el('div', 'guildBoostPrice alt onlyG', ONLY_G()));
      } else {
        var kPrice = fmt(b.kamasPrice) + ' ' + KAMA_UNIT();
        if (payCurrency === CURRENCY_KAMAS) {
          priceCol.appendChild(el('div', 'guildBoostPrice', kPrice));
          priceCol.appendChild(el('div', 'guildBoostPrice alt', gPrice));
        } else {
          priceCol.appendChild(el('div', 'guildBoostPrice', gPrice));
          priceCol.appendChild(el('div', 'guildBoostPrice alt', kPrice));
        }
      }
      row.appendChild(priceCol);

      var buyCol = el('div', 'colBuy');
      var buyCurrency = b.goultinesOnly ? CURRENCY_GOULTINES : payCurrency;
      var buyPrice = buyCurrency === CURRENCY_KAMAS ? Number(b.kamasPrice) || 0 : Number(b.goultinesPrice) || 0;
      var guildFunds = buyCurrency === CURRENCY_KAMAS
        ? (Number(msg.treasuryKamas) || 0)
        : (Number(msg.treasuryGoultines) || 0);
      var canBuy = msg.canManage && !b.maxed && guildFunds >= buyPrice;
      if (canBuy) {
        var buyBtn = el('div', 'guildBoostBtn buy', s.buy);
        buyBtn.addEventListener('click', function (id, forcedCurrency) {
          return function () {
            send('GuildBoostPurchaseRequestMessage', { boostId: id, currency: forcedCurrency, requestId: ++requestSeq });
          };
        }(b.boostId, buyCurrency));
        buyCol.appendChild(buyBtn);
      } else if (msg.canManage && !b.maxed) {
        // Tesorería sin fondos suficientes para la moneda/precio elegido.
        var noBtn = el('div', 'guildBoostBtn buy disabled', s.buy);
        noBtn.title = s.noFunds;
        buyCol.appendChild(noBtn);
      } else {
        buyCol.appendChild(el('div', 'guildBoostBtn buy disabled', b.maxed ? s.max : '—'));
      }
      row.appendChild(buyCol);

      boosts.appendChild(row);
    }
    root.appendChild(boosts);

    // Recent donations
    var don = el('div', 'guildBoostDonations');
    don.appendChild(el('div', 'guildBoostSectionTitle', s.lastDonations));
    var donArr = msg.donations || [];
    if (!donArr.length) {
      don.appendChild(el('div', 'guildBoostHint', s.noDonations));
    }
    for (var j = 0; j < donArr.length; j++) {
      var d = donArr[j];
      var dRow = el('div', 'guildBoostDonationRow');
      var when = d.timestamp ? new Date(d.timestamp * 1000) : null;
      var whenTxt = when ? when.toLocaleDateString(undefined) + ' ' +
        when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
      dRow.appendChild(el('span', 'guildBoostDonationName', d.characterName));
      dRow.appendChild(el('span', 'guildBoostDonationAmount',
        fmt(d.amount) + (d.currency === CURRENCY_GOULTINES ? ' G' : ' ' + KAMA_UNIT())));
      dRow.appendChild(el('span', 'guildBoostDonationWhen', whenTxt));
      don.appendChild(dRow);
    }
    root.appendChild(don);
  }

  // ── Donation modal ───────────────────────────────────────────────────

  function openDonateModal(msg) {
    closeDonateModal();
    var s = STR();

    var overlay = el('div', 'guildBoostModalOverlay');
    var box = el('div', 'guildBoostModal');

    box.appendChild(el('div', 'guildBoostModalTitle', s.donateTo));

    var cur = CURRENCY_KAMAS;
    var curRow = el('div', 'guildBoostModalCurRow');
    var kBtn = el('div', 'guildBoostBtn mini on', s.kamas);
    var gBtn = el('div', 'guildBoostBtn mini', s.goultines);
    function refreshCur() {
      kBtn.className = 'guildBoostBtn mini' + (cur === CURRENCY_KAMAS ? ' on' : '');
      gBtn.className = 'guildBoostBtn mini' + (cur === CURRENCY_GOULTINES ? ' on' : '');
      balanceTxt.textContent = s.available + ': ' +
        (cur === CURRENCY_KAMAS ? fmt(msg.myKamas) + ' ' + s.kamas : fmt(msg.myGoultines) + ' ' + s.goultines);
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
    input.placeholder = s.amount;
    input.className = 'guildBoostModalInput';
    box.appendChild(input);

    var btnRow = el('div', 'guildBoostModalBtns');
    var cancel = el('div', 'guildBoostBtn mini', s.cancel);
    cancel.addEventListener('click', closeDonateModal);
    var confirm = el('div', 'guildBoostBtn mini confirm', s.confirm);
    confirm.addEventListener('click', function () {
      var amount = parseInt(input.value, 10);
      if (!amount || amount <= 0) return;
      send('GuildDonationRequestMessage', { currency: cur, amount: amount, requestId: ++requestSeq });
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
  // imgs DEBE vivir fuera del callback: al declararlo dentro, cada tick del
  // interval lo arranca undefined y el primer tick que ya ve started=true
  // salta la creación → 'Cannot read properties of undefined (reading length)'.
  var imgs = []
  var timer = setInterval(function () {
    if (done) { clearInterval(timer); return }
    var base = assetsBase()
    if (!base) { if (++tries > 600) { clearInterval(timer); console.warn('[jobsPrewarm] sin base de assets — cancelado') } return }
    if (!started) {
      started = true
      imgs = []
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
          for (var j = 1; j <= 40; j++) files.push('gfx/jobs/' + j + '.png')
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

// ── $_fragSoulUse_v2 — fragmentos de alma: doble click → selector de item ──
// El protocolo stock no tiene "usar objeto sobre objeto" (ObjectUseMessage
// solo lleva el UID del fragmento).  Flujo oficial-style: doble click en un
// fragmento (typeId 115 / efecto 742) abre la ventana nativa "itemPicking"
// (la misma del mimetismo) en modo equipamiento; al elegir el item destino
// se envía ObjectFragmentUseMessage{objectUID, targetUID} y el servidor
// (FragmentManager) valida elegibilidad, máximo 5 y consume el stack.
//
// Piezas usadas del bundle (verificadas en build/script.js):
//   • window.singletons = webpack require; .c = cache de módulos instanciados
//     → se localiza el window manager por sus exports (open/getWindow/close/
//     arrangeOpeningWindow) sin hardcodear el id de módulo.
//   • window.gui.getWindow('equipment') = ventana de inventario; emite
//     "slot-doubletap" con el slot (slot.itemInstance = ItemInstance).
//   • wm.open('itemPicking') devuelve la ItemPickingWindow; .showEquippableItems()
//     filtra a equipo; la ventana re-emite "slot-doubletap" del storageView.
//   • window.dofus.sendMessage(type, data) — mismo contrato que ObjectFeedMessage.
;(function () {
  if (window.$_fragSoulUse_v2) return
  window.$_fragSoulUse_v2 = true

  var FRAGMENT_TYPE_ID = 115
  var MARKER_EFFECT_ID = 742
  var hooked = false

  function log(m) { try { console.warn('[fragUse] ' + m) } catch (e) {} }

  function itemInstanceOf(slot) {
    if (!slot) return null
    if (slot.itemInstance) return slot.itemInstance
    var ii = slot.getItem && slot.getItem()
    if (ii) return ii
    var d = slot.data
    return d && (d.objectUID !== undefined || typeof d.getProperty === 'function') ? d : null
  }

  function objectUIDOf(ii) {
    if (!ii) return null
    if (ii.objectUID !== undefined && ii.objectUID !== null) return ii.objectUID
    try { return ii.getProperty ? ii.getProperty('objectUID') : null } catch (e) { return null }
  }

  function typeIdOf(ii) {
    if (!ii) return 0
    var it = ii.item || null
    if (it && it.typeId !== undefined) return Number(it.typeId)
    try { return Number(ii.getProperty ? ii.getProperty('typeId') : 0) || 0 } catch (e) { return 0 }
  }

  function isFragmentInstance(ii) {
    if (!ii) return false
    if (typeIdOf(ii) === FRAGMENT_TYPE_ID) return true
    var effs = ii.effects || null
    if (effs && effs.length) {
      for (var i = 0; i < effs.length; i++) {
        var ef = effs[i]
        var id = ef && (ef.actionId !== undefined ? ef.actionId : ef.effectId)
        if (Number(id) === MARKER_EFFECT_ID) return true
      }
    }
    return false
  }

  function findWindowManager() {
    try {
      if (window.gui && typeof window.gui.open === 'function' &&
          typeof window.gui.getWindow === 'function' &&
          typeof window.gui.arrangeOpeningWindow === 'function') return window.gui
      var req = window.singletons
      if (!req || !req.c) return null
      for (var id in req.c) {
        var ex = req.c[id] && req.c[id].exports
        if (ex && typeof ex.open === 'function' && typeof ex.getWindow === 'function' &&
            typeof ex.close === 'function' && typeof ex.arrangeOpeningWindow === 'function') {
          return ex
        }
      }
    } catch (e) {}
    return null
  }

  var pendingFragment = null

  function onPickItem(slot) {
    try {
      var ii = itemInstanceOf(slot)
      var targetUID = objectUIDOf(ii)
      var fragUID = pendingFragment && objectUIDOf(pendingFragment)
      if (wm && picker) wm.close('itemPicking')
      if (targetUID == null || fragUID == null || targetUID === fragUID) return
      if (!window.dofus || typeof window.dofus.sendMessage !== 'function') { log('dofus.sendMessage no disponible'); return }
      window.dofus.sendMessage('ObjectFragmentUseMessage', {
        objectUID: fragUID,
        targetUID: targetUID
      })
    } catch (e) { log('pick err ' + (e && e.message)) }
    finally { pendingFragment = null }
  }

  var wm = null, picker = null

  function openPickerForFragment(fragII) {
    try {
      pendingFragment = fragII
      picker = wm.open('itemPicking')
      if (!picker) { pendingFragment = null; log('itemPicking no abrió'); return }
      if (typeof picker.showEquippableItems === 'function') picker.showEquippableItems()
      picker.on('slot-doubletap', onPickItem)
      picker.once('close', function () {
        try { picker && picker.removeListener && picker.removeListener('slot-doubletap', onPickItem) } catch (e) {}
        pendingFragment = null
        picker = null
      })
    } catch (e) { log('openPicker err ' + (e && e.message)); pendingFragment = null }
  }

  function hookEquipmentWindow() {
    if (hooked) return
    var eq = null
    try {
      if (wm && typeof wm.getWindow === 'function') eq = wm.getWindow('equipment')
      if (!eq && window.gui && typeof window.gui.getWindow === 'function') eq = window.gui.getWindow('equipment')
    } catch (e) {}
    if (!eq || typeof eq.on !== 'function') return
    hooked = true
    eq.on('slot-doubletap', function (slot) {
      try {
        var ii = itemInstanceOf(slot)
        if (!isFragmentInstance(ii)) return
        openPickerForFragment(ii)
      } catch (e) { log('doubletap err ' + (e && e.message)) }
    })
    log('doble click en fragmento → selector de item activo')
  }

  var tries = 0
  var timer = setInterval(function () {
    if (++tries > 600) { clearInterval(timer); return }
    try {
      if (!wm) wm = findWindowManager()
      if (wm && window.gui && window.gui.playerData) hookEquipmentWindow()
      if (wm && hooked) clearInterval(timer)
    } catch (e) {}
  }, 500)
})()

// ── $_npcBuybackPrice_v1 — precio real al vender a NPCs compradores ──
// El cliente calcula el precio de venta NPC como max(1, floor(item.price/10))
// y item.price vale 1 en Items.json → la UI muestra ~1k para todo. El
// servidor ya paga el precio correcto (NpcBuyback.json: nivel*kamasPorNivel);
// esto solo corrige la VISTA PREVIA del exchange (unitPrice/total/confirm).
// Espejo de data/custom/NpcBuyback.json — mantener ambos sincronizados.
;(function () {
  if (window.$_npcBuybackPrice_v1) return
  window.$_npcBuybackPrice_v1 = true

  var BUYBACK = {
    20516: {
      minLevel: 10,
      kamasPerLevel: 100,
      superTypes: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 7: 1, 10: 1, 11: 1, 12: 1 }
    }
  }

  function log(m) { try { console.warn('[buybackPrice] ' + m) } catch (e) {} }

  function findWm() {
    try {
      if (window.gui && typeof window.gui.open === 'function' &&
          typeof window.gui.getWindow === 'function' &&
          typeof window.gui.arrangeOpeningWindow === 'function') return window.gui
      var req = window.singletons
      if (!req || !req.c) return null
      for (var id in req.c) {
        var ex = req.c[id] && req.c[id].exports
        if (ex && typeof ex.open === 'function' && typeof ex.getWindow === 'function' &&
            typeof ex.close === 'function' && typeof ex.arrangeOpeningWindow === 'function') {
          return ex
        }
      }
    } catch (e) {}
    return null
  }

  var wm = null, hooked = false

  function hookTradeItem() {
    if (hooked) return
    var win = null
    try { win = wm && typeof wm.getWindow === 'function' ? wm.getWindow('tradeItem') : null } catch (e) {}
    if (!win || typeof win.on !== 'function') return
    hooked = true

    win.on('open', function () {
      try {
        var msg = this.msg
        if (!msg || msg._messageType !== 'ExchangeStartOkNpcShopMessage') return
        var npcId = msg.npcSellerId != null ? msg.npcSellerId : (msg.npcId != null ? msg.npcId : msg.sellerId)
        var rule = BUYBACK[npcId]
        if (!rule) return
        var box = this.exchangeBox
        if (!box || typeof box.updateSettingBox !== 'function') return
        if (box.__buybackWrapped) return
        box.__buybackWrapped = true

        var orig = box.updateSettingBox
        box.updateSettingBox = function () {
          orig.apply(this, arguments)
          try {
            if (this.mode !== 'sell-npc') return
            // Re-resolve the rule on EVERY call: win.msg changes per exchange
            // and the same settingBox serves shop/bidhouse/other NPCs.
            var m = win.msg
            var id = m && (m.npcSellerId != null ? m.npcSellerId : (m.npcId != null ? m.npcId : m.sellerId))
            var r = BUYBACK[id]
            if (!r) return
            var item = arguments[1]
            var lvl = item && typeof item.getProperty === 'function' ? item.getProperty('level') : null
            if (lvl == null && item && item.item) lvl = item.item.level
            lvl = Number(lvl) || 0
            if (lvl < r.minLevel) return
            var typeId = item && typeof item.getProperty === 'function' ? item.getProperty('typeId') : null
            if (typeId == null && item && item.item) typeId = item.item.typeId
            var types = window.gui && window.gui.databases && window.gui.databases.ItemTypes
            var st = types && types[typeId] ? types[typeId].superTypeId : null
            if (st != null && !r.superTypes[st]) return
            var unit = Math.max(1, Math.floor(lvl * r.kamasPerLevel))
            if (this.pricePerUnit !== unit) {
              this.pricePerUnit = unit
              if (typeof this._updatePrices === 'function') this._updatePrices()
            }
          } catch (e) {}
        }
        log('precio de recompra corregido para NPC ' + npcId)
      } catch (e) { log('open err ' + (e && e.message)) }
    })
  }

  var tries = 0
  var timer = setInterval(function () {
    if (++tries > 600) { clearInterval(timer); return }
    try {
      if (!wm) wm = findWm()
      if (wm && window.gui && window.gui.playerData) hookTradeItem()
      if (hooked) clearInterval(timer)
    } catch (e) {}
  }, 500)
})()

// ─────────────────────────────────────────────────────────────────────
// CuervoDex — ventana unificada custom (Prestigios + CuervoDex)
//
// Ventana NUEVA e independiente: hereda la clase base Window oficial
// (window.$_baseWindowClass, expuesta por regex patch en game-window.ts)
// y se registra con id propio 'cuervoDex' en el window manager — ninguna
// ventana oficial se modifica.  Botón propio inyectado en la MenuBar.
// Datos: CuervoDexOpenRequestMessage → CuervoDexStateMessage.
// ─────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_cuervoDexUI_v1) return
  window.$_cuervoDexUI_v1 = true

  var WINDOW_ID = 'cuervoDex'
  var LOG = '[cuervoDex]'
  function log(m) { try { console.warn(LOG + ' ' + m) } catch (e) {} }

  var LANG = (function () {
    var l = 'en'
    try {
      var dl = window.dofus && window.dofus.lang
      if (typeof dl === 'string' && dl) l = dl
      else if (window.Config && window.Config.language) l = window.Config.language
    } catch (err) {}
    l = String(l).toLowerCase()
    if (l.indexOf('es') === 0) return 'es'
    if (l.indexOf('fr') === 0) return 'fr'
    if (l.indexOf('pt') === 0) return 'pt'
    return 'en'
  })()

  var I18N = {
    en: {
      title: 'CuervoDex',
      tabPrestige: 'Prestiges',
      tabDex: 'CuervoDex',
      prestigeTitle: 'PRESTIGE',
      prestigeLevel: 'Prestige level',
      prestigeDesc: 'Ascend to reset your character to level 1 and gain permanent PvM bonuses. Requires level 200.',
      prestigeEmpty: 'No prestige levels available yet.',
      prestigeAscend: 'ASCEND',
      prestigeConfirm: 'Ascend now? Your character will return to level 1 with no gear or stats (scroll bonuses are kept).',
      dexTitle: 'CUERVODEX',
      dexDesc: 'Defeat dungeon bosses to unlock their cards and reveal them here.',
      dexEmpty: 'No bosses registered yet.',
      dexPoints: 'pts',
      dexBonusPerPoint: 'per point: ',
      dexBonusTotal: 'current bonus: ',
      btnDesc: '',
      reqLevelPre: 'Reach level ',
      reqQuestPre: 'Complete quest #',
      reqBossPre: 'Defeat ',
      reqAchievementPre: 'Complete achievement #',
      reqItemPre: 'Have ',
      rewardLabel: 'Rewards',
      rewardItem: 'Item #',
      prestigeNext: 'NEXT',
      prestigeDone: 'COMPLETED',
      lockedName: '???'
    },
    es: {
      title: 'CuervoDex',
      tabPrestige: 'Prestigios',
      tabDex: 'CuervoDex',
      prestigeTitle: 'PRESTIGIO',
      prestigeLevel: 'Nivel de prestigio',
      prestigeDesc: 'Asciende para reiniciar tu personaje a nivel 1 y ganar bonus PvM permanentes. Requiere nivel 200.',
      prestigeEmpty: 'Aún no hay niveles de prestigio disponibles.',
      prestigeAscend: 'ASCENDER',
      prestigeConfirm: '¿Ascender ahora? Tu personaje volverá a nivel 1 sin equipo ni estadísticas (se conservan los bonus de pergaminos).',
      dexTitle: 'CUERVODEX',
      dexDesc: 'Derrota jefes de mazmorra para desbloquear sus cartas y revelarlos aquí.',
      dexEmpty: 'Aún no hay bosses registrados.',
      dexPoints: 'pts',
      dexBonusPerPoint: 'por punto: ',
      dexBonusTotal: 'bonus actual: ',
      btnDesc: '',
      reqLevelPre: 'Alcanzar nivel ',
      reqQuestPre: 'Completar misión #',
      reqBossPre: 'Derrotar a ',
      reqAchievementPre: 'Completar logro #',
      reqItemPre: 'Tener ',
      rewardLabel: 'Recompensas',
      rewardItem: 'Objeto #',
      prestigeNext: 'SIGUIENTE',
      prestigeDone: 'COMPLETADO',
      lockedName: '???'
    },
    fr: {
      title: 'CuervoDex',
      tabPrestige: 'Prestiges',
      tabDex: 'CuervoDex',
      prestigeTitle: 'PRESTIGE',
      prestigeLevel: 'Niveau de prestige',
      prestigeDesc: 'Montez en prestige pour réinitialiser votre personnage au niveau 1 et gagner des bonus PvM permanents. Niveau 200 requis.',
      prestigeEmpty: 'Aucun niveau de prestige disponible.',
      prestigeAscend: 'MONTER',
      prestigeConfirm: 'Monter en prestige ? Votre personnage reviendra au niveau 1 sans équipement ni statistiques (les bonus de parchemins sont conservés).',
      dexTitle: 'CUERVODEX',
      dexDesc: 'Vainquez les boss de donjon pour débloquer leurs cartes et les révéler ici.',
      dexEmpty: 'Aucun boss enregistré.',
      dexPoints: 'pts',
      dexBonusPerPoint: 'par point : ',
      dexBonusTotal: 'bonus actuel : ',
      btnDesc: '',
      reqLevelPre: 'Atteindre le niveau ',
      reqQuestPre: 'Terminer la quête n°',
      reqBossPre: 'Vaincre ',
      reqAchievementPre: 'Obtenir le succès n°',
      reqItemPre: 'Posséder ',
      rewardLabel: 'Récompenses',
      rewardItem: 'Objet n°',
      prestigeNext: 'SUIVANT',
      prestigeDone: 'TERMINÉ',
      lockedName: '???'
    },
    pt: {
      title: 'CuervoDex',
      tabPrestige: 'Prestígios',
      tabDex: 'CuervoDex',
      prestigeTitle: 'PRESTÍGIO',
      prestigeLevel: 'Nível de prestígio',
      prestigeDesc: 'Ascenda para reiniciar seu personagem ao nível 1 e ganhar bônus PvM permanentes. Requer nível 200.',
      prestigeEmpty: 'Ainda não há níveis de prestígio disponíveis.',
      prestigeAscend: 'ASCENDER',
      prestigeConfirm: 'Ascender agora? Seu personagem voltará ao nível 1 sem equipamento nem atributos (bônus de pergaminhos são mantidos).',
      dexTitle: 'CUERVODEX',
      dexDesc: 'Derrote chefes de masmorra para desbloquear suas cartas e revelá-los aqui.',
      dexEmpty: 'Ainda não há chefes registrados.',
      dexPoints: 'pts',
      dexBonusPerPoint: 'por ponto: ',
      dexBonusTotal: 'bônus atual: ',
      btnDesc: '',
      reqLevelPre: 'Alcançar nível ',
      reqQuestPre: 'Completar missão n°',
      reqBossPre: 'Derrotar ',
      reqAchievementPre: 'Completar conquista n°',
      reqItemPre: 'Ter ',
      rewardLabel: 'Recompensas',
      rewardItem: 'Item n°',
      prestigeNext: 'PRÓXIMO',
      prestigeDone: 'CONCLUÍDO',
      lockedName: '???'
    }
  }
  function txt() { return I18N[LANG] || I18N.en }

  // ── Nombres de stats para el bonus por punto del CuervoDex ──────────
  // Misma convención que la pestaña de boosts: clave oficial ui.stats.* /
  // ui.common.* primero, fallback localizado propio si falta en el idioma.
  var CDX_STAT_I18N = {
    strength: 'ui.stats.strength', vitality: 'ui.stats.vitality',
    wisdom: 'ui.stats.wisdom', chance: 'ui.stats.chance',
    agility: 'ui.stats.agility', intelligence: 'ui.stats.intelligence',
    power: 'ui.stats.damagesBonusPercent', range: 'ui.common.range',
    actionPoints: 'ui.common.ap', movementPoints: 'ui.common.mp',
    summons: 'ui.common.summonableCreatures', initiative: 'ui.stats.initiative'
  };
  var CDX_STAT_FB = {
    en: { strength: 'Strength', vitality: 'Vitality', wisdom: 'Wisdom', chance: 'Chance', agility: 'Agility', intelligence: 'Intelligence', power: 'Power %', range: 'Range', actionPoints: 'AP', movementPoints: 'MP', summons: 'Summons', initiative: 'Initiative' },
    es: { strength: 'Fuerza', vitality: 'Vitalidad', wisdom: 'Sabiduría', chance: 'Suerte', agility: 'Agilidad', intelligence: 'Inteligencia', power: 'Poder %', range: 'Rango', actionPoints: 'PA', movementPoints: 'PM', summons: 'Invocaciones', initiative: 'Iniciativa' },
    fr: { strength: 'Force', vitality: 'Vitalité', wisdom: 'Sagesse', chance: 'Chance', agility: 'Agilité', intelligence: 'Intelligence', power: 'Puissance %', range: 'Portée', actionPoints: 'PA', movementPoints: 'PM', summons: 'Invocations', initiative: 'Initiative' },
    pt: { strength: 'Força', vitality: 'Vitalidade', wisdom: 'Sabedoria', chance: 'Sorte', agility: 'Agilidade', intelligence: 'Inteligência', power: 'Poder %', range: 'Alcance', actionPoints: 'PA', movementPoints: 'PM', summons: 'Invocações', initiative: 'Iniciativa' }
  };
  function cdxT(key, fallback) {
    try {
      var m = window.$_i18nModule
      if (m && typeof m.hasText === 'function' && typeof m.getText === 'function' && m.hasText(key)) {
        var out = m.getText(key)
        if (out && out.indexOf('[?') !== 0) return out
      }
    } catch (err) { /* diccionario no listo — fallback */ }
    return fallback
  }
  function cdxStatName(k) {
    var fb = (CDX_STAT_FB[LANG] || CDX_STAT_FB.en)[k] || k
    var key = CDX_STAT_I18N[k]
    return key ? cdxT(key, fb) : fb
  }
  function cdxNum(n) { return String(parseFloat(Number(n).toFixed(4))) }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  function send(type, data) {
    try {
      if (window.dofus && typeof window.dofus.sendMessage === 'function')
        window.dofus.sendMessage(type, data || {})
    } catch (err) { log('send ' + type + ' failed: ' + (err && err.message)) }
  }

  function findWm() {
    try {
      // Preferir el objeto que expone addWindow (el window manager real);
      // window.gui puede ser un facade sin él.
      var req = window.singletons
      if (req && req.c) {
        for (var id in req.c) {
          var ex = req.c[id] && req.c[id].exports
          if (ex && typeof ex.addWindow === 'function' && typeof ex.open === 'function' &&
              typeof ex.getWindow === 'function') return ex
        }
      }
      if (window.gui && typeof window.gui.open === 'function' &&
          typeof window.gui.getWindow === 'function' &&
          typeof window.gui.arrangeOpeningWindow === 'function') return window.gui
      if (req && req.c) {
        for (var id2 in req.c) {
          var ex2 = req.c[id2] && req.c[id2].exports
          if (ex2 && typeof ex2.open === 'function' && typeof ex2.getWindow === 'function' &&
              typeof ex2.close === 'function' && typeof ex2.arrangeOpeningWindow === 'function')
            return ex2
        }
      }
    } catch (e) {}
    return null
  }

  // ── Estado ──
  var wm = null
  var win = null
  var registered = false
  var lastState = null

  function onState(msg) {
    lastState = msg || null
    try { renderState() } catch (e) { log('renderState err ' + (e && e.message)) }
  }

  function wireState() {
    var cm = window.dofus && window.dofus.connectionManager
    if (!cm || cm.__cuervoDexWired) return
    cm.__cuervoDexWired = true
    try { cm.on('CuervoDexStateMessage', onState) } catch (e) {}
  }

  // ── Construcción de la ventana ──
  function CuervoDexWindow() {
    var Base = window.$_baseWindowClass
    Base.call(this, {
      className: 'cuervoDexWindow',
      title: txt().title,
      positionInfo: { left: 'c', top: 'c', width: 940, height: 620 }
    })
    this._cdxBuild()
  }
  function buildWindowClass() {
    var Base = window.$_baseWindowClass
    if (!Base) return false
    // El prototipo ya tiene los métodos propios (_cdxBuild, renderState...)
    // asignados al cargarse el script.  Al reemplazarlo por uno que herede
    // de Base.prototype hay que copiarlos o se pierden.
    var oldProto = CuervoDexWindow.prototype
    var proto = CuervoDexWindow.prototype = Object.create(Base.prototype)
    proto.constructor = CuervoDexWindow
    var names = Object.getOwnPropertyNames(oldProto)
    for (var i = 0; i < names.length; i++) {
      var k = names[i]
      if (k !== 'constructor') proto[k] = oldProto[k]
    }
    return true
  }

  CuervoDexWindow.prototype._cdxBuild = function () {
    var body = this.windowBody && this.windowBody.rootElement
    if (!body) { log('windowBody no disponible'); return }

    var t = txt()

    // Tab bar
    var tabs = el('div', 'cdxTabs')
    var tabP = el('div', 'cdxTab active', t.tabPrestige)
    var tabD = el('div', 'cdxTab', t.tabDex)
    tabP.setAttribute('data-tab', 'prestige')
    tabD.setAttribute('data-tab', 'dex')
    tabs.appendChild(tabP)
    tabs.appendChild(tabD)
    body.appendChild(tabs)

    // Panel Prestigios
    var panelP = el('div', 'cdxPanel cdxPrestigePanel')
    panelP.appendChild(el('div', 'cdxSectionTitle', t.prestigeTitle))
    var lvlRow = el('div', 'cdxLevelRow')
    lvlRow.appendChild(el('span', 'cdxLevelLabel', t.prestigeLevel + ':'))
    var lvlVal = el('span', 'cdxLevelValue', '0')
    lvlRow.appendChild(lvlVal)
    panelP.appendChild(lvlRow)
    panelP.appendChild(el('div', 'cdxDesc', t.prestigeDesc))
    var plist = el('div', 'cdxPrestigeList')
    plist.appendChild(el('div', 'cdxEmpty', t.prestigeEmpty))
    panelP.appendChild(plist)
    var ascendBtn = el('div', 'cdxAscendBtn', t.prestigeAscend)
    ascendBtn.classList.add('disabled')
    panelP.appendChild(ascendBtn)

    // Panel CuervoDex
    var panelD = el('div', 'cdxPanel cdxDexPanel')
    panelD.style.display = 'none'
    panelD.appendChild(el('div', 'cdxSectionTitle', t.dexTitle))
    panelD.appendChild(el('div', 'cdxDesc', t.dexDesc))
    var grid = el('div', 'cdxBossGrid')
    grid.appendChild(el('div', 'cdxEmpty', t.dexEmpty))
    panelD.appendChild(grid)

    function switchTab(which) {
      tabP.classList.toggle('active', which === 'prestige')
      tabD.classList.toggle('active', which === 'dex')
      panelP.style.display = which === 'prestige' ? '' : 'none'
      panelD.style.display = which === 'dex' ? '' : 'none'
    }
    tabP.addEventListener('click', function () { switchTab('prestige') })
    tabD.addEventListener('click', function () { switchTab('dex') })

    body.appendChild(panelP)
    body.appendChild(panelD)

    // Re-pedir estado cada vez que se abre la ventana.
    var self = this
    this.on('open', function () {
      send('CuervoDexOpenRequestMessage', {})
      if (lastState) renderState()
    })
  }

  // ── Render del estado servidor ──
  function cdxAssetsBase() {
    var a = (window.Config && window.Config.assetsUrl) || '../assets/'
    return String(a).replace(/\/+$/, '')
  }

  function reqText(r) {
    var t = txt()
    switch (r.type) {
      case 'level': return t.reqLevelPre + r.value
      case 'quest': return t.reqQuestPre + (r.refName || ('#' + r.refId))
      case 'bossKill':
        var need = r.value || 1
        var prog = (typeof r.progress === 'number' && r.progress >= 0) ? r.progress : null
        return t.reqBossPre + (r.refName || ('#' + r.refId)) + ' ×' + need +
          (prog !== null ? ' (' + prog + '/' + need + ')' : '')
      case 'achievement': return t.reqAchievementPre + r.refId
      case 'item':
        var needItem = r.value || 1
        var ownedItem = (typeof r.progress === 'number' && r.progress >= 0) ? r.progress : null
        return t.reqItemPre + (r.refName || ('#' + r.refId)) +
          (needItem > 1 || ownedItem !== null ? ' ×' + needItem +
            (ownedItem !== null ? ' (' + ownedItem + '/' + needItem + ')' : '') : '')
      default: return r.type + (r.refId ? ' #' + r.refId : '') + (r.value ? ' ' + r.value : '')
    }
  }

  function renderPrestiges(list, state) {
    var t = txt()
    list.innerHTML = ''
    var prestiges = (state && state.prestiges) || []
    var cur = (state && state.prestigeLevel) || 0
    if (!prestiges.length) {
      list.appendChild(el('div', 'cdxEmpty', t.prestigeEmpty))
      return
    }
    for (var i = 0; i < prestiges.length; i++) {
      (function (p) {
        var done = p.level <= cur
        var card = el('div', 'cdxPrestigeCard' + (p.canAscend ? ' next' : ''))

        var head = el('div', 'cdxPrestigeHead')
        head.appendChild(el('span', 'cdxPrestigeName', p.name || ('Prestige ' + p.level)))
        head.appendChild(el('span', 'cdxPrestigeTag' + (done ? ' done' : ''),
          done ? t.prestigeDone : (p.canAscend ? t.prestigeNext : 'P' + p.level)))
        card.appendChild(head)

        var reqs = p.requirements || []
        if (reqs.length) {
          var ul = el('ul', 'cdxReqList')
          for (var j = 0; j < reqs.length; j++) {
            (function (r) {
              var li = el('li', 'cdxReqItem ' + (r.completed ? 'done' : 'todo'))
              li.appendChild(el('span', 'cdxReqMark', r.completed ? '✓' : '✗'))
              if (r.refIcon > 0) {
                var rim = document.createElement('img')
                rim.className = 'cdxReqIcon'
                rim.src = cdxAssetsBase() + '/gfx/items/' + r.refIcon + '.png'
                rim.alt = ''
                rim.onerror = function () { this.style.display = 'none' }
                li.appendChild(rim)
              }
              li.appendChild(el('span', 'cdxReqText', reqText(r)))
              ul.appendChild(li)
            })(reqs[j])
          }
          card.appendChild(ul)
        }

        var rewards = p.rewardItems || []
        var icons = p.rewardIcons || []
        var names = p.rewardNames || []
        if (rewards.length) {
          var rw = el('div', 'cdxRewardRow')
          rw.appendChild(el('span', 'cdxRewardLabel', t.rewardLabel + ':'))
          for (var k = 0; k < rewards.length; k++) {
            var chip = el('span', 'cdxRewardChip')
            var iconId = icons[k] || 0
            if (iconId > 0) {
              var im = document.createElement('img')
              im.className = 'cdxRewardIcon'
              im.src = cdxAssetsBase() + '/gfx/items/' + iconId + '.png'
              im.alt = ''
              im.onerror = function () { this.style.display = 'none' }
              chip.appendChild(im)
            }
            chip.appendChild(document.createTextNode(names[k] || (t.rewardItem + rewards[k])))
            rw.appendChild(chip)
          }
          card.appendChild(rw)
        }

        // Guarda extra: el botón solo se muestra si el servidor marca
        // canAscend Y todos los requisitos vienen completados — nunca
        // habilitar con condiciones parciales aunque el flag viniera mal.
        var allReqsDone = (p.requirements || []).every(function (r) { return !!r.completed })
        if (p.canAscend && allReqsDone) {
          var btn = el('div', 'cdxAscendBtn', t.prestigeAscend)
          btn.addEventListener('click', function () {
            // Ascensión real (fase 2): el servidor valida TODO
            // (nivel ≥200, requisitos, siguiente prestigio) y ejecuta el
            // reset — nivel 1, stats base + scrolls, equipo des-equipado.
            // Confirmación nativa: la acción es destructiva e irreversible.
            if (!window.confirm(t.prestigeConfirm || 'Ascender ahora? El personaje volverá a nivel 1 sin equipo ni estadísticas (se conservan los puntos de pergamino).')) return
            send('PrestigeAscendRequestMessage', {})
          })
          card.appendChild(btn)
        }
        list.appendChild(card)
      })(prestiges[i])
    }
  }

  function renderDex(grid, state) {
    var t = txt()
    grid.innerHTML = ''
    var bosses = (state && state.bosses) || []
    if (!bosses.length) {
      grid.appendChild(el('div', 'cdxEmpty', t.dexEmpty))
      return
    }
    for (var i = 0; i < bosses.length; i++) {
      (function (b) {
        var locked = !b.unlocked
        var cell = el('div', 'cdxBossCell' + (locked ? ' locked' : ' unlocked'))

        var icon = el('div', 'cdxBossIcon' + (locked ? ' silhouette' : ''))
        var img = document.createElement('img')
        img.src = cdxAssetsBase() + '/gfx/monsters/' + b.bossId + '.png'
        img.alt = locked ? t.lockedName : (b.name || ('Boss ' + b.bossId))
        img.onerror = function () { img.style.display = 'none' }
        icon.appendChild(img)
        cell.appendChild(icon)

        cell.appendChild(el('div', 'cdxBossName', locked ? t.lockedName : (b.name || ('Boss ' + b.bossId))))
        cell.appendChild(el('div', 'cdxBossPts', (b.points || 0) + '/' + (b.maxPoints || 0) + ' ' + t.dexPoints))

        var max = b.maxPoints || 0
        var bar = el('div', 'cdxBossBar')
        var fill = el('div', 'cdxBossBarFill')
        fill.style.width = (max > 0 ? Math.min(100, ((b.points || 0) / max) * 100) : 0) + '%'
        bar.appendChild(fill)
        cell.appendChild(bar)

        // Bonus de stats por punto (config CuervoDex.json → bonusStats).
        // Solo visible con el boss desbloqueado; la aplicación real es
        // server-side y exclusiva de combates PvM.
        var cbs = (!locked && b.bonusStats) ? b.bonusStats : []
        if (cbs.length) {
          var pts = b.points || 0
          var perParts = []
          var totParts = []
          for (var bi = 0; bi < cbs.length; bi++) {
            var bs = cbs[bi]
            if (!bs || !bs.stat || !(bs.perPoint > 0)) continue
            var nm = cdxStatName(bs.stat)
            perParts.push('+' + cdxNum(bs.perPoint) + ' ' + nm)
            totParts.push('+' + Math.round(pts * bs.perPoint) + ' ' + nm)
          }
          if (perParts.length) {
            cell.appendChild(el('div', 'cdxBossBonus', t.dexBonusPerPoint + perParts.join(' · ')))
            if (pts > 0)
              cell.appendChild(el('div', 'cdxBossBonus cdxBossBonusTotal', t.dexBonusTotal + totParts.join(' · ')))
          }
        }

        grid.appendChild(cell)
      })(bosses[i])
    }
  }

  function renderState() {
    if (!win || !win.rootElement || !lastState) return
    var lvlVal = win.rootElement.querySelector('.cdxLevelValue')
    if (lvlVal) lvlVal.textContent = String(lastState.prestigeLevel || 0)
    var plist = win.rootElement.querySelector('.cdxPrestigeList')
    if (plist) renderPrestiges(plist, lastState)
    var grid = win.rootElement.querySelector('.cdxBossGrid')
    if (grid) renderDex(grid, lastState)
  }

  function registerWindow() {
    // El manager real expone addWindow; window.gui puede ser facade — probar ambos.
    var candidates = []
    if (wm && typeof wm.addWindow === 'function') candidates.push(wm)
    if (window.gui && typeof window.gui.addWindow === 'function' && candidates.indexOf(window.gui) === -1)
      candidates.push(window.gui)
    for (var i = 0; i < candidates.length; i++) {
      try {
        candidates[i].addWindow(WINDOW_ID, win, {})
        wm = candidates[i]
        log('ventana registrada: ' + WINDOW_ID + ' (vía ' + (candidates[i] === window.gui ? 'gui' : 'manager') + ')')
        return true
      } catch (e) { log('addWindow err ' + (e && e.message)) }
    }
    return false
  }

  // Réplica de MenuBar._positionIcon (bundle):
  //   narrow/ipadRatio: x=(w+1)*(t%perLine),  y=(w+2)*floor(t/perLine)
  //   wide:             x=(w+4)*floor(t/perCol), y=w*(t%perCol)
  // `w` = paso vertical entre iconos de una misma columna (se mide de dos
  // iconos reales que compartan `left`).  Si no se puede medir, cae al
  // slot libre detectado por proximidad.
  function positionNextSlot(mb, icons, btn) {
    try {
      var n = icons.length
      if (!n) { btn.style.left = '0px'; btn.style.top = '0px'; return }

      // Paso w = tamaño del slot del icono (offsetHeight del primero; en el
      // bundle w es la constante de pitch de la grella).  Fallback: diff
      // vertical entre dos iconos que compartan `left`.
      var w = icons[0].offsetHeight || icons[0].clientHeight || 0
      if (!w) {
        var byLeft = {}
        for (var i = 0; i < n; i++) {
          var ic = icons[i]
          var l = ic.style && ic.style.left
          var tp = ic.style && ic.style.top
          if (l == null || tp == null) continue
          if (byLeft[l] != null) {
            var d = Math.abs(parseInt(tp, 10) - parseInt(byLeft[l], 10))
            if (d > 0) { w = d; break }
          } else byLeft[l] = tp
        }
      }
      if (!w) w = 48

      var narrow = !!(window.gui && window.gui.ipadRatio)
      var perLine = mb._iconsPerLine || 4
      var perCol = mb._iconsPerColumn || Math.ceil(n / perLine) || 4
      var t = n // siguiente índice libre
      var x, y
      if (narrow) {
        x = (w + 1) * (t % perLine)
        y = (w + 2) * Math.floor(t / perLine)
      } else {
        x = (w + 4) * Math.floor(t / perCol)
        y = w * (t % perCol)
      }
      btn.style.left = x + 'px'
      btn.style.top = y + 'px'
    } catch (e) {
      // Fallback: debajo del último icono.
      var last = icons.length ? icons[icons.length - 1] : null
      if (last) {
        btn.style.left = (last.style && last.style.left) || '0px'
        var tp2 = last.style && last.style.top
        if (tp2 != null) btn.style.top = (parseInt(tp2, 10) + (last.offsetHeight || 48) + 6) + 'px'
      }
    }
  }

  // ── Botón en la MenuBar ──
  function injectButton() {
    try {
      var mb = window.gui && window.gui.menuBar
      if (!mb) return false
      // _icons es el contenedor de los botones oficiales (coordenadas
      // left/top absolutas); _iconsBox/rootElement son fallbacks.
      var root = (mb._icons && mb._icons.rootElement) ||
                 (mb._iconsBox && mb._iconsBox.rootElement) ||
                 mb.rootElement || null
      if (!root || typeof root.querySelector !== 'function') return false
      if (root.querySelector('.cdxMenuBtn')) return true

      var icons = root.querySelectorAll('.menuBarIcon:not(.cdxMenuBtn)')
      var btn = el('div', 'menuBarIcon cdxMenuBtn')
      btn.appendChild(el('div', 'cdxMenuIcon'))
      btn.title = txt().title

      // Tooltip: primero el helper oficial del bundle; además un tooltip
      // propio on-hover (fiable aunque addTooltip no exista en esta build).
      try {
        var desc = txt().btnDesc || txt().title
        if (window.gui && typeof window.gui.addTooltip === 'function') {
          window.gui.addTooltip(btn, function () { return desc })
        } else if (window.r && typeof window.r.addTooltip === 'function') {
          window.r.addTooltip(btn, function () { return desc })
        }
        btn.setAttribute('alt', desc)
        btn.setAttribute('aria-label', desc)

        var tip = null
        btn.addEventListener('mouseenter', function () {
          if (tip) return
          tip = el('div', 'cdxMenuTip', desc)
          btn.appendChild(tip)
        })
        btn.addEventListener('mouseleave', function () {
          if (tip && tip.parentNode) tip.parentNode.removeChild(tip)
          tip = null
        })
      } catch (e) { /* tooltip no crítico */ }

      // Posición: réplica de _positionIcon del bundle — los iconos se
      // distribuyen en COLUMNAS (wide) o FILAS (ipadRatio/narrow) con paso
      // constante.  Se derivan las métricas de los iconos reales para no
      // hardcodear nada y no pisar el último icono oficial.
      positionNextSlot(mb, icons, btn)

      function open() {
        try {
          log('click — win:' + !!win + ' wm:' + !!wm + ' registered:' + registered +
              ' baseClass:' + !!window.$_baseWindowClass + ' hasOpen:' + !!(wm && wm.open))
          if (wm && typeof wm.open === 'function') {
            var w = wm.getWindow ? wm.getWindow(WINDOW_ID) : null
            log('getWindow(' + WINDOW_ID + '):' + (w ? 'OK' : 'null'))
            wm.open(WINDOW_ID)
          } else {
            log('wm.open no disponible')
          }
        } catch (e) { log('open err ' + (e && e.message)) }
      }
      btn.addEventListener('click', function (e) { e.stopPropagation(); open() })
      btn.addEventListener('tap', function (e) { e.stopPropagation(); open() })

      root.appendChild(btn)
      log('botón inyectado en MenuBar')
      return true
    } catch (e) { log('injectButton err ' + (e && e.message)); return false }
  }

  // ── Boot ──
  var tries = 0
  var timer = setInterval(function () {
    if (++tries > 600) { clearInterval(timer); return }
    try {
      wireState()
      if (!win) {
        if (!window.$_baseWindowClass && tries === 60)
          log('$_baseWindowClass no expuesto tras ~40s — ¿cliente sin el patch de game-window.ts?')
        if (!buildWindowClass()) return
        try {
          win = new CuervoDexWindow()
          log('instancia de ventana creada')
        } catch (e) { log('new CuervoDexWindow err ' + (e && e.message)); return }
      }
      if (!wm) wm = findWm()
      if (wm && !registered) registered = registerWindow()
      if (!window.$_cdxBtnDone && injectButton()) window.$_cdxBtnDone = true
      if (registered && window.$_cdxBtnDone) clearInterval(timer)
    } catch (e) { log('boot err ' + (e && e.message)) }
  }, 700)

  // Re-inyección lenta: la MenuBar se reconstruye en reconnect/cambio de
  // personaje y el botón inyectado desaparece con ella.
  setInterval(function () {
    try {
      var mb = window.gui && window.gui.menuBar
      var root = mb && ((mb._icons && mb._icons.rootElement) ||
                 (mb._iconsBox && mb._iconsBox.rootElement) || mb.rootElement)
      if (root && typeof root.querySelector === 'function') {
        var existing = root.querySelector('.cdxMenuBtn')
        if (!existing) {
          window.$_cdxBtnDone = false
          injectButton()
        } else {
          // Re-posicionar: la grella se reordena/resize y el botón debe
          // seguir al último slot libre.
          try {
            var icons = root.querySelectorAll('.menuBarIcon:not(.cdxMenuBtn)')
            positionNextSlot(window.gui.menuBar, icons, existing)
          } catch (e2) {}
        }
      }
    } catch (e) {}
  }, 5000)
})()

// ── TAX COLLECTOR — emblema del gremio en el estandarte (GuildUp_1) ──
// El cliente oficial compone el look del perceptor con el emblema del gremio
// sobre el símbolo "GuildUp_1" del sprite bones/714.  Los templates de
// animación exponen externalSymbols[className]: una lista enlazada cuyo
// .last.object sustituye al símbolo en createSprites.  Renderizamos el
// emblema con la clase oficial EmblemLogo (expuesta por game-window.ts como
// $_emblemLogoClass), lo convertimos en textura GL y lo inyectamos como
// símbolo externo — solo en actores GameRolePlay/GameFightTaxCollector-
// Informations.  Cada template/animación tiene su propia lista, así que se
// parchea cada symbol-manager que exponga GuildUp_1 (idle/walk/run...).
;(function () {
  if (window.$_taxCollectorEmblem) return
  window.$_taxCollectorEmblem = true

  var EMBLEM_SYMBOL = 'GuildUp_1'
  var POLL_MS = 800
  var MAX_TRIES = 60
  var SIZE = 64
  var emblemCanvas = {}   // emblemKey -> canvas
  var emblemTexture = {}  // emblemKey -> gl texture
  var pending = {}        // actorId -> {key, tries}

  function log(m) { try { console.log('[DofEmu][TCEmblem] ' + m) } catch (e) {} }

  function emblemOf(actor) {
    try {
      var d = actor && actor.data
      if (!d) return null
      var t = d.type
      if (t !== 'GameRolePlayTaxCollectorInformations' &&
          t !== 'GameFightTaxCollectorInformations') return null
      var g = d.guild && d.guild.guildEmblem
      return g || null
    } catch (e) { return null }
  }

  function emblemKey(g) {
    return [g.symbolShape, g.symbolColor, g.backgroundShape, g.backgroundColor].join('|')
  }

  function renderEmblemCanvas(g, done) {
    var key = emblemKey(g)
    if (emblemCanvas[key]) return done(emblemCanvas[key])
    var Logo = window.$_emblemLogoClass
    if (!Logo) return done(null)
    try {
      var logo = new Logo({ width: SIZE, height: SIZE })
      var finish = function () {
        try {
          var ctx = logo.getContext && logo.getContext()
          var canvas = ctx && ctx.canvas
          if (!canvas || !canvas.width) return done(null)
          emblemCanvas[key] = canvas
          done(canvas)
        } catch (e) { done(null) }
      }
      // setValue(emblem, dec2rgb, callback): true fuerza hexToRgb sobre los
      // colores del emblema (vienen como int 0xRRGGBB por el wire).
      logo.setValue(g, true, finish)
    } catch (e) { done(null) }
  }

  function emblemTextureFor(g, done) {
    var key = emblemKey(g)
    if (emblemTexture[key]) return done(emblemTexture[key])
    renderEmblemCanvas(g, function (canvas) {
      if (!canvas) return done(null)
      try {
        var scene = window.isoEngine && window.isoEngine.mapScene
        if (!scene || typeof scene.createTexture !== 'function') return done(null)
        var tex = scene.createTexture(canvas)
        if (!tex) return done(null)
        emblemTexture[key] = tex
        done(tex)
      } catch (e) { done(null) }
    })
  }

  // Lista enlazada compatible con el engine (módulo de linked list):
  // render lee .length y .last.object; merge/unmerge usan addBack/addFront/
  // removeByReference(node).  Los nodos llevan {object,container}.
  function fakeSymbolList(symbol) {
    var list = {
      length: 0, first: null, last: null,
      _node: function (o) { return { object: o, previous: null, next: null, container: list } },
      addBack: function (o) {
        var n = list._node(o)
        if (!list.first) { list.first = n; list.last = n }
        else { n.previous = list.last; list.last.next = n; list.last = n }
        list.length += 1
        return n
      },
      addFront: function (o) {
        var n = list._node(o)
        if (!list.first) { list.first = n; list.last = n }
        else { n.next = list.first; list.first.previous = n; list.first = n }
        list.length += 1
        return n
      },
      removeByReference: function (n) {
        if (!n || n.container !== list) return
        if (n.previous) n.previous.next = n.next
        if (n.next) n.next.previous = n.previous
        if (list.first === n) list.first = n.next
        if (list.last === n) list.last = n.previous
        list.length -= 1
      }
    }
    list.addBack(symbol)
    return list
  }

  // Recorre el animManager y devuelve TODOS los objetos que actúan como
  // symbol-manager (tienen externalSymbols + getSymbol + exposedSymbols).
  function collectSymbolManagers(root, out) {
    out = out || []
    var seen = []
    ;(function walk(o, depth) {
      if (!o || typeof o !== 'object' || depth > 7) return
      if (seen.indexOf(o) !== -1) return
      seen.push(o)
      var isMgr = false
      try {
        isMgr = !!(o.externalSymbols && typeof o.getSymbol === 'function' &&
                   o.exposedSymbols)
      } catch (e) {}
      if (isMgr) { out.push(o); return } // no hace falta bajar más
      var keys
      try { keys = Object.keys(o) } catch (e) { return }
      for (var i = 0; i < keys.length; i++) {
        var v
        try { v = o[keys[i]] } catch (e) { continue }
        if (v && typeof v === 'object') walk(v, depth + 1)
      }
    })(root, 0)
    return out
  }

  function patchManager(sm, actor, key) {
    var original
    try { original = sm.getSymbol(EMBLEM_SYMBOL) } catch (e) { original = null }
    if (!original) return false
    emblemTextureFor(emblemOf(actor), function (tex) {
      if (!tex) return
      try {
        // Releer por si el template cambió mientras cargaba la textura.
        var cur
        try { cur = sm.getSymbol(EMBLEM_SYMBOL) } catch (e) { cur = original }
        if (!cur) return
        var clone = {}
        for (var k in cur) clone[k] = cur[k]
        clone.className = EMBLEM_SYMBOL
        clone.texture = tex
        clone.textureCoord = [0, 0, 1, 1]
        clone.nbFrames = 1
        sm.externalSymbols[EMBLEM_SYMBOL] = fakeSymbolList(clone)
        sm.__tcEmblemKey = key
        log('emblema aplicado en ' + (sm.name || 'template') +
            ' (actor ' + actor.actorId + ')')
      } catch (e) { log('patch err ' + (e && e.message)) }
    })
    return true
  }

  function tick() {
    try {
      var actors = window.actorManager && window.actorManager.actors
      if (!actors) return
      for (var id in actors) {
        var actor = actors[id]
        try {
          var g = emblemOf(actor)
          if (!g) continue
          var key = emblemKey(g)
          var st = pending[id]
          if (st && st.key === key) {
            if (++st.tries > MAX_TRIES) { delete pending[id]; continue }
          } else {
            pending[id] = { key: key, tries: 0 }
            st = pending[id]
          }
          var anim = actor.animManager
          if (!anim) continue
          var managers = collectSymbolManagers(anim)
          var pendingAny = false
          for (var i = 0; i < managers.length; i++) {
            var sm = managers[i]
            try {
              if (sm.__tcEmblemKey === key) continue
              var has = sm.externalSymbols[EMBLEM_SYMBOL] ||
                        (sm.exposedSymbols && sm.exposedSymbols[EMBLEM_SYMBOL])
              if (!has) continue
              if (patchManager(sm, actor, key)) pendingAny = true
            } catch (e) {}
          }
          if (!pendingAny) delete pending[id]
        } catch (e) { /* un actor roto no rompe el tick */ }
      }
    } catch (e) {}
  }

  setInterval(tick, POLL_MS)
  log('watcher iniciado')
})()

// ─────────────────────────────────────────────────────────────────────────
// $_nativeLoginForm — mini-formulario de login DENTRO de la UI del juego.
//
// Modo nativo (beta/self-hosted): el emulador sirve webAuth.
// requireWebPlatformAuth === false en config.json → /api/login-mode
// responde { nativeLogin: true }.  En ese caso:
//   • Se inyectan campos usuario/contraseña + botón "Conectar" dentro del
//     LoginsForm oficial (clases CSS del propio juego: inputText/whiteStyle,
//     bigWhiteButton) — nada de páginas externas ni iframes.
//   • Al enviar se llama window.gui.loginScreen._login({account,password})
//     → startLoginProcess → HaapiKeyManager.login → CreateApiKey nativo →
//     token → dofus.login.  CERO web.
//   • Los elementos web-auth (botón JUGAR, shortcuts, separador, guest)
//     se ocultan y requestWebAuthKey/GuestToken/Token quedan neutralizados
//     vía window.$_authManager (mismo módulo que $_authManager expone).
// Modo web (default/prod): no se toca NADA — flujo oficial intacto.
// ─────────────────────────────────────────────────────────────────────────
;(function () {
  if (window.$_nativeLoginForm) return
  window.$_nativeLoginForm = true

  var POLL_MS = 1000
  var MODE_RECHECK_MS = 30000
  var state = { checked: false, native: false, lastCheck: 0, injected: false, block: null, hidden: [], lang: null }

  // ── i18n: idioma del cliente (dofus.lang / Config.language) ──
  // Se re-evalúa en cada tick: si el jugador cambia de idioma con el form
  // ya inyectado, los labels se re-traducen sin re-inyectar.
  function detectLang() {
    var l = 'en'
    try {
      var dl = window.dofus && window.dofus.lang
      if (typeof dl === 'string' && dl) l = dl
      else if (window.Config && window.Config.language) l = window.Config.language
    } catch (err) { /* default */ }
    l = String(l).toLowerCase()
    if (l.indexOf('es') === 0) return 'es'
    if (l.indexOf('fr') === 0) return 'fr'
    if (l.indexOf('pt') === 0) return 'pt'
    return 'en'
  }

  // Fallbacks cuando la clave no existe en los diccionarios oficiales
  // (mismo patrón que el resto de módulos de fixes.js).
  var I18N = {
    es: {
      introText:   'Inicia sesión con tu cuenta',
      username:    'Usuario',
      password:    'Contraseña',
      connect:     'Conectar',
      errorEmpty:  'Completa usuario y contraseña'
    },
    en: {
      introText:   'Sign in with your account',
      username:    'Username',
      password:    'Password',
      connect:     'Sign in',
      errorEmpty:  'Fill in username and password'
    },
    fr: {
      introText:   'Connectez-vous avec votre compte',
      username:    'Identifiant',
      password:    'Mot de passe',
      connect:     'Connexion',
      errorEmpty:  'Remplissez identifiant et mot de passe'
    },
    pt: {
      introText:   'Inicie sessão com a sua conta',
      username:    'Utilizador',
      password:    'Palavra-passe',
      connect:     'Iniciar sessão',
      errorEmpty:  'Preencha utilizador e palavra-passe'
    }
  }

  function T(key, fbKey) {
    try {
      var m = window.$_i18nModule
      var hasFn = !!(m && typeof m.hasText === 'function')
      if (m && typeof m.getText === 'function' && (!hasFn || m.hasText(key))) {
        var v = m.getText(key)
        // El failover del juego imprime "<lang>[?<key>]" — tratarlo como
        // clave ausente para usar el fallback localizado.
        if (v && v.indexOf('[?') !== 0 && /^[a-z]{2,3}\[/.exec(v) === null) return v
      }
    } catch (e) {}
    var t = I18N[detectLang()] || I18N.en
    return t[fbKey] !== undefined ? t[fbKey] : fbKey
  }

  // Re-aplica los textos del mini-form con el idioma actual (Llamado por
  // tick cuando detecta un cambio de idioma con el form ya inyectado).
  function refreshLabels(block) {
    if (!block) return
    var desc = block.querySelector('.cuervokDesc')
    var userIn = block.querySelector('.cuervokUser')
    var passIn = block.querySelector('.cuervokPass')
    var btn = block.querySelector('.cuervokBtn')
    if (desc) desc.textContent = T('ui.login.introText', 'introText')
    if (userIn) userIn.placeholder = T('ui.login.username', 'username')
    if (passIn) passIn.placeholder = T('ui.login.password', 'password')
    if (btn) btn.textContent = T('ui.login.connect', 'connect')
  }

  function css() {
    if (document.getElementById('cuervokNativeLoginCss')) return
    var st = document.createElement('style')
    st.id = 'cuervokNativeLoginCss'
    st.textContent =
      '.cuervokNL{margin-top:14px;text-align:center}' +
      '.cuervokNL input{display:block;width:100%;max-width:280px;margin:8px auto;' +
      'padding:10px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);' +
      'background:rgba(255,255,255,.06);color:#e8e0d0;font-size:14px;outline:none;' +
      'box-sizing:border-box}' +
      '.cuervokNL input:focus{border-color:rgba(201,162,77,.6)}' +
      '.cuervokNL .cuervokBtn{display:inline-block;min-width:180px;padding:10px 22px;' +
      'border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;' +
      'background:linear-gradient(180deg,#dbb867,#b8913a);color:#1a1510;' +
      'letter-spacing:.02em;user-select:none}' +
      '.cuervokNL .cuervokBtn.disabled{opacity:.5;pointer-events:none}' +
      '.cuervokNL .cuervokErr{color:#ff6b6b;font-size:12px;margin-top:8px;min-height:14px}' +
      '.cuervokNL .cuervokDesc{color:rgba(255,255,255,.55);font-size:12px;margin-bottom:6px}'
    document.head.appendChild(st)
  }

  function neutralizeWebAuth() {
    try {
      var am = window.$_authManager
      if (!am || am.__cuervokNativeLocked) return
      am.__cuervokNativeLocked = true
      // Guardar originales para poder restaurar el flujo web si el flag
      // requireWebPlatformAuth vuelve a true.
      am.__cuervokOrigWebAuth = {
        requestWebAuthKey: am.requestWebAuthKey,
        requestWebAuthGuestToken: am.requestWebAuthGuestToken,
        requestWebAuthValidateGuestToken: am.requestWebAuthValidateGuestToken
      }
      function fail(cb) { try { if (typeof cb === 'function') cb(new Error('web auth disabled (native mode)')) } catch (e) {} }
      if (typeof am.requestWebAuthKey === 'function') {
        am.requestWebAuthKey = function () {}
      }
      if (typeof am.requestWebAuthGuestToken === 'function') {
        am.requestWebAuthGuestToken = function (e, cb) { fail(cb || (e && e.cb)) }
      }
      if (typeof am.requestWebAuthValidateGuestToken === 'function') {
        am.requestWebAuthValidateGuestToken = function (e, cb) { fail(cb || (e && e.cb)) }
      }
    } catch (e) {}
  }

  function restoreWebAuth() {
    try {
      var am = window.$_authManager
      var orig = am && am.__cuervokOrigWebAuth
      if (!am || !orig) return
      if (orig.requestWebAuthKey) am.requestWebAuthKey = orig.requestWebAuthKey
      if (orig.requestWebAuthGuestToken) am.requestWebAuthGuestToken = orig.requestWebAuthGuestToken
      if (orig.requestWebAuthValidateGuestToken) am.requestWebAuthValidateGuestToken = orig.requestWebAuthValidateGuestToken
      am.__cuervokOrigWebAuth = null
      am.__cuervokNativeLocked = false
    } catch (e) {}
  }

  function hideWebElements(form) {
    try {
      var hide = function (el) {
        if (el && el.style && el.style.display !== 'none') {
          el.style.display = 'none'
          state.hidden.push(el)
        }
      }
      // Botones/elementos exclusivos del flujo web dentro del LoginsForm.
      hide(form.querySelector('.shortcuts'))
      hide(form.querySelector('.separator'))
      // El wrapper del botón JUGAR (horizontalCenter directo de .form).
      var f = form.querySelector('.form') || form
      var hc = f.querySelector(':scope > .horizontalCenter')
      if (hc) hide(hc)
      // Guest: botones cuyo texto coincide con las keys oficiales de guest.
      var guestTexts = [
        T('ui.login.playGuest', 'JUGAR COMO INVITADO'),
        T('ui.login.continueGuest', 'CONTINUAR COMO INVITADO'),
        T('ui.login.continueAsGuest', 'CONTINUAR COMO INVITADO')
      ]
      var buttons = document.querySelectorAll('.bigWhiteButton,.smallWhiteButton,.bigEmptyButton,.smallEmptyButton')
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i]
        var tx = (b.textContent || '').trim().toUpperCase()
        if (!tx) continue
        for (var g = 0; g < guestTexts.length; g++) {
          var gt = (guestTexts[g] || '').trim().toUpperCase()
          if (gt && tx === gt) { hide(b.closest('.horizontalCenter') || b); break }
        }
      }
      // Texto introductorio del flujo web.
      var desc = form.querySelector('.descText')
      if (desc) hide(desc)
    } catch (e) {}
  }

  function inject(screen, form) {
    if (state.injected) return
    state.injected = true
    state.lang = detectLang()
    css()
    neutralizeWebAuth()
    hideWebElements(form)

    var f = form.querySelector('.form') || form
    var block = document.createElement('div')
    block.className = 'cuervokNL'
    block.innerHTML =
      '<div class="cuervokDesc">' + T('ui.login.introText', 'introText') + '</div>' +
      '<input class="cuervokUser" type="text" autocomplete="username" placeholder="' + T('ui.login.username', 'username') + '">' +
      '<input class="cuervokPass" type="password" autocomplete="current-password" placeholder="' + T('ui.login.password', 'password') + '">' +
      '<div style="text-align:center;margin-top:6px">' +
      '<div class="cuervokBtn">' + T('ui.login.connect', 'connect') + '</div></div>' +
      '<div class="cuervokErr"></div>'
    // Insertar antes de shortcuts/separator si existen; si no, al final del .form.
    var anchor = f.querySelector('.shortcuts') || f.querySelector('.separator') || null
    if (anchor && anchor.parentNode === f) f.insertBefore(block, anchor)
    else f.appendChild(block)
    state.block = block

    var userIn = block.querySelector('.cuervokUser')
    var passIn = block.querySelector('.cuervokPass')
    var btn = block.querySelector('.cuervokBtn')
    var err = block.querySelector('.cuervokErr')

    function submit() {
      var account = (userIn.value || '').trim()
      var password = passIn.value || ''
      if (!account || !password) {
        err.textContent = T('ui.login.errorEmpty', 'errorEmpty')
        return
      }
      if (typeof screen._login !== 'function') return
      btn.classList.add('disabled')
      err.textContent = ''
      try {
        screen._login({ account: account, password: password })
      } catch (e) {
        btn.classList.remove('disabled')
        err.textContent = String(e && e.message || e)
      }
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); submit() })
    ;[userIn, passIn].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit() }
      })
      inp.addEventListener('input', function () { btn.classList.remove('disabled'); err.textContent = '' })
    })
    setTimeout(function () { try { userIn.focus() } catch (e) {} }, 300)
  }

  // Quita el mini-form y restaura los elementos web-auth: se usa cuando el
  // flag requireWebPlatformAuth pasa a true con la sesión ya en login.
  function cleanup() {
    try {
      if (state.block && state.block.parentNode) state.block.parentNode.removeChild(state.block)
    } catch (e) {}
    state.block = null
    for (var i = 0; i < state.hidden.length; i++) {
      try { state.hidden[i].style.display = '' } catch (e) {}
    }
    state.hidden = []
    state.injected = false
    restoreWebAuth()
  }

  function tick() {
    try {
      var screen = window.gui && window.gui.loginScreen
      var form = document.querySelector('.LoginsForm')
      if (!screen || !form) return

      // Modo: consulta /api/login-mode (mismo origen, sin CORS).
      var now = Date.now()
      if (!state.checked || (now - state.lastCheck > MODE_RECHECK_MS)) {
        state.lastCheck = now
        fetch('/api/login-mode', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (d) {
            var wasNative = state.native
            state.native = !!(d && d.nativeLogin)
            state.checked = true
            if (state.native) {
              inject(screen, form)
            } else if (wasNative && state.injected) {
              cleanup()
            }
          })
          .catch(function () { state.checked = true; state.native = false })
        return
      }
      if (state.native && !state.injected) inject(screen, form)
      // Si el juego re-renderizó el LoginsForm (p.ej. al cambiar idioma) y
      // nuestro bloque quedó desconectado, permitir re-inyección limpia.
      if (state.injected && state.block && !state.block.isConnected) {
        state.injected = false
        state.block = null
        state.hidden = []
      }
      // Cambio de idioma con el form ya puesto → re-traducir labels.
      if (state.injected && state.block) {
        var cur = detectLang()
        if (cur !== state.lang) {
          state.lang = cur
          refreshLabels(state.block)
        }
      }
    } catch (e) {}
  }

  setInterval(tick, POLL_MS)
})()
