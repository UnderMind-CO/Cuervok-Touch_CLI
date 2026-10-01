#!/usr/bin/env node
// Minimal auth E2E: mirror the REAL client's exact frames.
const AUTH = 'ws://localhost:3000/primus/'
const TOKEN = 'ee0d0608-2ae1-4032-928c-98ac08b97f8b'

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', (e) => reject(new Error('ws error: ' + e.message)))
  })
}

async function main() {
  const ws = await connect(AUTH)
  console.log('CONNECTED')

  ws.addEventListener('close', (e) => console.log('CLOSE code=', e.code, 'reason=', e.reason))
  ws.addEventListener('error', (e) => console.log('ERROR', e.message || e.type))

  ws.addEventListener('message', (ev) => {
    const t = String(ev.data)
    if (t.startsWith('4')) {
      try {
        const o = JSON.parse(t.slice(1))
        if (o._messageType) console.log('<-', o._messageType)
        else if (o.call) console.log('<- call:' + o.call)
      } catch {}
    } else if (t.startsWith('2')) {
      // engine.io ping → pong
      ws.send('3')
      console.log('<- engine.io ping, sent pong')
    } else if (t.startsWith('0')) {
      console.log('<- engine.io open:', t.slice(0, 60))
    } else {
      console.log('<- raw:', t.slice(0, 80))
    }
  })

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // 1. connecting
  ws.send('4' + JSON.stringify({ call: 'connecting', data: { language: 'es', server: 'login', client: 'android', appVersion: '3.11.0', buildVersion: '1.73.8' } }))
  await sleep(150)
  // 2. login — same shape as the real client
  ws.send('4' + JSON.stringify({
    call: 'login',
    data: {
      username: '1',
      token: TOKEN,
      forcedAccount: '',
      salt: 'kbgvrb5aYZa&udoTr&~z3JACZDKTe&.F',
      key: [],
    },
  }))
  console.log('login sent')

  await sleep(3000)
  console.log('DONE')
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
