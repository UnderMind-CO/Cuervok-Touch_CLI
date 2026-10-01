#!/usr/bin/env node
/**
 * End-to-end test: login via the auth server (3000), get the game ticket,
 * connect to the game server (666), select character 8 and verify the
 * InventoryContentMessage arrives with the real items.
 */

const AUTH = 'ws://localhost:3000/primus/'
const GAME = 'ws://localhost:666/primus/'
const TOKEN = 'ee0d0608-2ae1-4032-928c-98ac08b97f8b' // account 1 (TestPlayer)
const CHAR_ID = 8 // Shodan

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
  })
}

function send(ws, obj) {
  ws.send('4' + JSON.stringify(obj))
}

function collect(ws, pred, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs)
    const onMsg = (ev) => {
      const text = String(ev.data)
      if (!text.startsWith('4')) return
      try {
        const obj = JSON.parse(text.slice(1))
        if (pred(obj)) {
          clearTimeout(timer)
          ws.removeEventListener('message', onMsg)
          resolve(obj)
        }
      } catch { /* ignore non-json frames */ }
    }
    ws.addEventListener('message', onMsg)
  })
}

// Log all received messages (for debugging)
function logAll(ws, tag) {
  ws.addEventListener('message', (ev) => { const data = ev.data;
    const t = String(data)
    if (t.startsWith('4')) {
      try {
        const o = JSON.parse(t.slice(1))
        if (o._messageType) console.log(`[${tag} <-] ${o._messageType}`)
        else if (o.call) console.log(`[${tag} <-] call:${o.call}`)
        else if (o.type) console.log(`[${tag} <-] type:${o.type}`)
      } catch {}
    }
  })
}

async function main() {
  // ── 1. AUTH ──
  const auth = await connect(AUTH)
  logAll(auth, 'auth')
  send(auth, { call: 'connecting', data: { language: 'es', server: 'login', client: 'android', appVersion: '3.11.0', buildVersion: '1.73.8' } })

  const hello = await collect(auth, (o) => o._messageType === 'HelloConnectMessage')
  console.log('AUTH: HelloConnectMessage', JSON.stringify(hello).slice(0, 120))

  await new Promise((r) => setTimeout(r, 150))
  send(auth, {
    call: 'login',
    data: {
      username: '1',
      token: TOKEN,
      forcedAccount: '',
      salt: 'kbgvrb5aYZa&udoTr&~z3JACZDKTe&.F',
      key: [],
    },
  })
  console.log('AUTH: login sent')

  const servers = await collect(auth, (o) => o._messageType === 'ServersListMessage')
  console.log('AUTH: ServersListMessage OK (', servers.servers?.length, 'servers )')

  send(auth, { call: 'sendMessage', data: { type: 'ServerSelectionMessage', data: { serverId: 405 } } })

  const selected = await collect(auth, (o) => o._messageType === 'SelectedServerDataMessage')
  const ticket = selected.ticket
  console.log('AUTH: SelectedServerDataMessage ticket=', ticket, 'port=', selected.port)
  auth.close()

  // ── 2. GAME ──
  const game = await connect(GAME)
  logAll(game, 'game')
  send(game, { call: 'connecting', data: { language: 'es', server: { address: 'localhost', port: 666, id: 405 }, client: 'android', appVersion: '3.11.0', buildVersion: '1.73.8' } })

  await collect(game, (o) => o._messageType === 'HelloGameMessage')
  console.log('GAME: HelloGameMessage')

  send(game, { call: 'sendMessage', data: { type: 'AuthenticationTicketMessage', data: { ticket, lang: 'es' } } })
  await collect(game, (o) => o._messageType === 'AuthenticationTicketAcceptedMessage')
  console.log('GAME: AuthenticationTicketAccepted')

  // wait a moment for the server to flush settings, then request characters
  await new Promise((r) => setTimeout(r, 500))
  send(game, { call: 'sendMessage', data: { type: 'CharactersListRequestMessage', data: {} } })
  const list = await collect(game, (o) => o._messageType === 'CharactersListWithRemodelingMessage' || o._messageType === 'CharactersListMessage')
  console.log('GAME:', list._messageType, ':', list.characters?.length, 'characters')

  // ── 3. SELECT CHARACTER ──
  send(game, { call: 'sendMessage', data: { type: 'CharacterSelectionMessage', data: { id: CHAR_ID } } })

  // The inventory must arrive right after selection
  const inv = await collect(game, (o) => o._messageType === 'InventoryContentMessage', 10000)
  console.log('GAME: InventoryContentMessage objects =', inv.objects?.length)
  let effectsOk = 0
  let bare = 0
  for (const it of inv.objects || []) {
    for (const e of it.effects || []) {
      if (e._type && e._type !== 'ObjectEffect') effectsOk++
      else bare++
    }
  }
  console.log(`      effects with _type: ${effectsOk}, bare effects: ${bare}`)
  console.log('      sample item:', JSON.stringify((inv.objects || [])[1]).slice(0, 400))

  // give the connection a moment, then close
  setTimeout(() => { game.close(); process.exit(0) }, 500)
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
