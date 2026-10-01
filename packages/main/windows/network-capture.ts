import { WebContents, Debugger, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { get } from '../constants'
import { logger } from '../logger'

/**
 * Release hardening: the capture files are a complete map of the game
 * protocol (request/response bodies + WS frames) — shipping them in every
 * user's %APPDATA% hands the internals to anyone at a click. In packaged
 * builds the capture is OFF by default; CUERVOK_CAPTURE=1 re-enables it for
 * a support session. Dev builds keep it always on.
 */
const CAPTURE_ENABLED = !app.isPackaged || process.env.CUERVOK_CAPTURE === '1'

/**
 * Captures ALL network traffic (HTTP + WebSocket) to a structured JSONL file
 * for reverse-engineering the Dofus Touch protocol.
 *
 * Output: %APPDATA%/Cuervok/captures/capture-<timestamp>.jsonl
 *
 * Each line is a JSON object with:
 *   { ts, type, ... }
 *
 * Types:
 *   http-request   – full HTTP request (method, url, headers, postData)
 *   http-response  – full HTTP response (status, headers, body preview)
 *   ws-open        – WebSocket connection opened (url)
 *   ws-send        – WebSocket frame sent (payload)
 *   ws-recv        – WebSocket frame received (payload)
 *   ws-close       – WebSocket closed
 *   ws-error       – WebSocket error
 *   info           – metadata (capture start, etc.)
 */

interface CaptureEntry {
  ts: string
  type: string
  [key: string]: unknown
}

const MAX_BODY_CHARS = 50_000 // 50KB per body to keep file manageable
const WS_PAYLOAD_MAX = 200_000 // 200KB for WS frames (game protocol can be chunky)

export class NetworkCapture {
  private _writeStream: fs.WriteStream | null = null
  private _win: WebContents
  private _capturePath: string = ''
  private _requestBodies = new Map<string, string>()
  private _pendingResponses = new Map<string, { requestId: string; url: string; status: number; statusText: string; headers: Record<string, string> }>()

  constructor(win: WebContents) {
    this._win = win
  }

  start() {
    if (!CAPTURE_ENABLED) {
      logger.info('[CAPTURE] Disabled in packaged build (CUERVOK_CAPTURE=1 to enable)')
      return
    }
    const captureDir = path.join(get.GAME_PATH(), '..', 'captures')
    if (!fs.existsSync(captureDir)) fs.mkdirSync(captureDir, { recursive: true })

    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    this._capturePath = path.join(captureDir, `capture-${ts}.jsonl`)
    this._writeStream = fs.createWriteStream(this._capturePath, { flags: 'a' })

    this._log({
      ts: new Date().toISOString(),
      type: 'info',
      message: 'Network capture started',
      path: this._capturePath
    })

    logger.info(`[CAPTURE] Traffic capture started → ${this._capturePath}`)

    this._setupCDPCapture()
  }

  stop() {
    this._log({
      ts: new Date().toISOString(),
      type: 'info',
      message: 'Network capture stopped'
    })
    this._writeStream?.end()
    this._writeStream = null
    this._requestBodies.clear()
    this._pendingResponses.clear()
    logger.info(`[CAPTURE] Traffic capture stopped → ${this._capturePath}`)
  }

  get capturePath(): string {
    return this._capturePath
  }

  /** Log a pre-intercepted HTTP request (from webRequest.onBeforeRequest) */
  logHttpRequest(details: { method: string; url: string; uploadData?: Electron.UploadData[]; requestHeaders?: Record<string, string> }) {
    if (details.url.startsWith('http://127.0.0.1')) return

    let postData = ''
    if (details.uploadData?.length) {
      for (const chunk of details.uploadData) {
        if (chunk.bytes) postData += chunk.bytes.toString('utf-8')
        else if (chunk.blobUUID) {
          // Blob data needs async fetch — skip for now, CDP will catch it
        }
      }
    }

    this._log({
      ts: new Date().toISOString(),
      type: 'http-request',
      method: details.method,
      url: details.url,
      headers: details.requestHeaders ?? {},
      body: postData ? this._truncate(postData, MAX_BODY_CHARS) : undefined
    })
  }

  /** Log a pre-intercepted HTTP response (from webRequest.onCompleted) */
  logHttpResponse(details: { method: string; url: string; statusCode: number; responseHeaders?: Record<string, string | string[]> }) {
    if (details.url.startsWith('http://127.0.0.1')) return

    const headers: Record<string, string> = {}
    if (details.responseHeaders) {
      for (const [k, v] of Object.entries(details.responseHeaders)) {
        headers[k] = Array.isArray(v) ? v.join('; ') : v
      }
    }

    this._log({
      ts: new Date().toISOString(),
      type: 'http-response',
      method: details.method,
      url: details.url,
      status: details.statusCode,
      headers
    })
  }

  /** Log HTTP error */
  logHttpError(details: { method: string; url: string; error: string }) {
    if (details.url.startsWith('http://127.0.0.1')) return

    this._log({
      ts: new Date().toISOString(),
      type: 'http-error',
      method: details.method,
      url: details.url,
      error: details.error
    })
  }

  // ─── CDP-based capture (full bodies + WebSocket) ───

  private _setupCDPCapture() {
    const dbg = this._win.debugger
    try {
      dbg.attach('1.3')
    } catch {
      logger.warn('[CAPTURE] Could not attach CDP debugger for deep capture')
      return
    }

    dbg.sendCommand('Network.enable').catch(() => {})

    dbg.on('message', (_event: unknown, method: string, params: Record<string, unknown>) => {
      switch (method) {
        // ─── HTTP request with body ───
        case 'Network.requestWillBeSent': {
          const req = params.request as { url: string; method: string; headers: Record<string, string>; postData?: string } | undefined
          const requestId = params.requestId as string
          if (!req || req.url.startsWith('http://127.0.0.1')) return

          // Store body for later correlation
          if (req.postData) {
            this._requestBodies.set(requestId, req.postData)
          }

          // Only log if NOT already captured by webRequest interceptor
          // (CDP gives us the body, webRequest doesn't)
          if (req.postData) {
            this._log({
              ts: new Date().toISOString(),
              type: 'http-request-body',
              requestId,
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: this._truncate(req.postData, MAX_BODY_CHARS)
            })
          }
          break
        }

        // ─── HTTP response headers ───
        case 'Network.responseReceived': {
          const resp = params.response as { url: string; status: number; statusText: string; headers: Record<string, string> } | undefined
          const requestId = params.requestId as string
          if (!resp || resp.url.startsWith('http://127.0.0.1')) return

          this._pendingResponses.set(requestId, {
            requestId,
            url: resp.url,
            status: resp.status,
            statusText: resp.statusText,
            headers: resp.headers
          })
          break
        }

        // ─── HTTP response body (after loading finished) ───
        case 'Network.loadingFinished': {
          const requestId = params.requestId as string
          const pending = this._pendingResponses.get(requestId)
          if (!pending) return

          this._pendingResponses.delete(requestId)
          this._requestBodies.delete(requestId)

          // Fetch response body via CDP
          dbg.sendCommand('Network.getResponseBody', { requestId })
            .then((result: { body: string; base64Encoded?: boolean }) => {
              const body = result.base64Encoded
                ? `[base64:${result.body.length} chars]`
                : result.body

              this._log({
                ts: new Date().toISOString(),
                type: 'http-response-body',
                requestId,
                method: 'GET',
                url: pending.url,
                status: pending.status,
                headers: pending.headers,
                body: this._truncate(body, MAX_BODY_CHARS)
              })
            })
            .catch(() => {
              // Body not available (probably already consumed)
              this._log({
                ts: new Date().toISOString(),
                type: 'http-response-body',
                requestId,
                url: pending.url,
                status: pending.status,
                note: 'body not available'
              })
            })
          break
        }

        // ─── WebSocket ───
        case 'Network.webSocketCreated': {
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-open',
            url: params.url as string,
            requestId: params.requestId as string
          })
          break
        }

        case 'Network.webSocketWillSendHandshakeRequest': {
          const req = params.request as { headers?: Record<string, string> } | undefined
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-handshake',
            requestId: params.requestId as string,
            headers: req?.headers ?? {}
          })
          break
        }

        case 'Network.webSocketHandshakeResponseReceived': {
          const resp = params.response as { status?: number; headers?: Record<string, string> } | undefined
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-handshake-response',
            requestId: params.requestId as string,
            status: resp?.status,
            headers: resp?.headers ?? {}
          })
          break
        }

        case 'Network.webSocketFrameSent': {
          const resp = params.response as { payloadData?: string } | undefined
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-send',
            requestId: params.requestId as string,
            payload: this._truncate(resp?.payloadData, WS_PAYLOAD_MAX),
            payloadLength: resp?.payloadData?.length ?? 0
          })
          break
        }

        case 'Network.webSocketFrameReceived': {
          const resp = params.response as { payloadData?: string } | undefined
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-recv',
            requestId: params.requestId as string,
            payload: this._truncate(resp?.payloadData, WS_PAYLOAD_MAX),
            payloadLength: resp?.payloadData?.length ?? 0
          })
          break
        }

        case 'Network.webSocketClosed': {
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-close',
            requestId: params.requestId as string,
            timestamp: params.timestamp as number
          })
          break
        }

        case 'Network.webSocketFrameError': {
          this._log({
            ts: new Date().toISOString(),
            type: 'ws-error',
            requestId: params.requestId as string,
            errorMessage: params.errorMessage as string
          })
          break
        }
      }
    })
  }

  private _log(entry: CaptureEntry) {
    if (!this._writeStream) return
    try {
      this._writeStream.write(JSON.stringify(entry) + '\n')
    } catch {
      // Don't let capture errors break the app
    }
  }

  private _truncate(str: string | undefined, max: number): string {
    if (!str) return ''
    if (str.length <= max) return str
    return str.substring(0, max) + `...[truncated, total ${str.length} chars]`
  }
}
