// This file was originally copied from:
// https://github.com/polkadot-js/api/blob/3a8b1c5683fa975de3279a3b1e0e5c0652a95cfa/packages/rpc-provider/src/substrate-connect/ScProvider.ts
//
// If you download the original version from this link, you can see what has been changed by us.

// Copyright 2017-2022 @polkadot/rpc-provider authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { RpcCoder } from "@polkadot/rpc-provider/coder"
import { healthChecker } from "@polkadot/rpc-provider/substrate-connect/Health"
import type {
  JsonRpcResponse,
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
} from "@polkadot/rpc-provider/types"
import { isError } from "@polkadot/util"
import { Chain, Client, ClientOptions, start } from "@substrate/smoldot-light"
import EventEmitter from "eventemitter3"

type ResponseCallback = (response: string | Error) => void

// These methods have been taken from:
// https://github.com/paritytech/smoldot/blob/17425040ddda47d539556eeaf62b88c4240d1d42/src/json_rpc/methods.rs#L338-L462
// It's important to take into account that smoldot is adding support to the new
// json-rpc-interface https://paritytech.github.io/json-rpc-interface-spec/
// However, at the moment this list only includes methods that belong to the "old" API
const subscriptionUnsubscriptionMethods = new Map<string, string>([
  ["author_submitAndWatchExtrinsic", "author_unwatchExtrinsic"],
  ["chain_subscribeAllHeads", "chain_unsubscribeAllHeads"],
  ["chain_subscribeFinalizedHeads", "chain_unsubscribeFinalizedHeads"],
  ["chain_subscribeFinalisedHeads", "chain_subscribeFinalisedHeads"],
  ["chain_subscribeNewHeads", "chain_unsubscribeNewHeads"],
  ["chain_subscribeNewHead", "chain_unsubscribeNewHead"],
  ["chain_subscribeRuntimeVersion", "chain_unsubscribeRuntimeVersion"],
  ["subscribe_newHead", "unsubscribe_newHead"],
  ["state_subscribeRuntimeVersion", "state_unsubscribeRuntimeVersion"],
  ["state_subscribeStorage", "state_unsubscribeStorage"],
])

let client: Client

export class SmoldotProvider implements ProviderInterface {
  readonly #coder: RpcCoder = new RpcCoder()
  readonly #subscriptions: Map<
    string,
    [ResponseCallback, { unsubscribeMethod: string; id: string | number }]
  > = new Map()

  readonly #requests: Map<number, ResponseCallback> = new Map()
  readonly #eventemitter: EventEmitter = new EventEmitter()
  #chain: Promise<Chain> | null = null
  #isChainReady = false

  readonly #chainspec: string
  readonly #databaseContent: string | undefined

  constructor(chainspec: string, databaseContent?: string) {
    this.#chainspec = chainspec
    this.#databaseContent = databaseContent
  }

  get hasSubscriptions(): boolean {
    // Indicates that subscriptions are supported
    return true
  }

  get isConnected(): boolean {
    return !!this.#chain && this.#isChainReady
  }

  async databaseContent(maxUtf8BytesSize?: number): Promise<string> {
    if (!this.#chain) throw new Error("No chain")
    return (await this.#chain).databaseContent(maxUtf8BytesSize)
  }

  clone(): ProviderInterface {
    throw new Error("clone() is not supported on SmoldotProvider")
  }

  // Config details can be found in @substrate/connect repo following the link:
  // https://github.com/paritytech/substrate-connect/blob/main/packages/connect/src/connector/index.ts
  async connect(config: ClientOptions = {}): Promise<void> {
    if (this.isConnected) throw new Error("Already connected")

    // it could happen that after emitting `disconnected` due to the fact that
    // smoldot is syncing, the consumer tries to reconnect after a certain amount
    // of time... In which case we want to make sure that we don't create a new
    // chain.
    if (this.#chain) {
      await this.#chain
      return
    }

    client =
      client ||
      start({
        // In order to avoid confusing inconsistencies between browsers and NodeJS, TCP connections are always disabled.
        forbidTcp: true,
        // Prevents browsers from emitting warnings if smoldot tried to establish non-secure WebSocket connections
        forbidNonLocalWs: true,
        // TODO: Set this via env var or build target or something?
        maxLogLevel: 4,
        // Politely limit the CPU usage of the smoldot background worker.
        cpuRateLimit: 0.5,
        logCallback: (level, target, message) => {
          if (level <= 1) {
            console.error("[%s] %s", target, message) // eslint-disable-line no-console
          } else if (level === 2) {
            console.warn("[%s] %s", target, message) // eslint-disable-line no-console
          } else if (level === 3) {
            console.info("[%s] %s", target, message) // eslint-disable-line no-console
          } else if (level === 4) {
            console.debug("[%s] %s", target, message) // eslint-disable-line no-console
          } else {
            console.trace("[%s] %s", target, message) // eslint-disable-line no-console
          }
        },
        ...config,
      })

    const hc = healthChecker()

    const onResponse = (res: string): void => {
      const hcRes = hc.responsePassThrough(res)

      if (!hcRes) {
        return
      }

      const response = JSON.parse(hcRes) as JsonRpcResponse
      let decodedResponse: string | Error

      try {
        decodedResponse = this.#coder.decodeResponse(response) as string
      } catch (e) {
        decodedResponse = e as Error
      }

      // It's not a subscription message, but rather a standar RPC response
      if (response.params?.subscription === undefined || !response.method) {
        return this.#requests.get(response.id)?.(decodedResponse)
      }

      // We are dealing with a subscription message
      const subscriptionId = `${response.method}::${response.params.subscription}`

      const callback = this.#subscriptions.get(subscriptionId)?.[0]

      callback?.(decodedResponse)
    }

    // eslint-disable-next-line no-console
    console.log(
      "Initializing chain with databaseContent",
      JSON.parse(this.#chainspec)?.id,
      this.#databaseContent
    )
    this.#chain = client
      .addChain({
        chainSpec: this.#chainspec,
        databaseContent: this.#databaseContent,
        jsonRpcCallback: onResponse,
        // TODO: Add relay chains here
        // potentialRelayChains: [],
      })
      .then((chain) => {
        hc.setSendJsonRpc(chain.sendJsonRpc)

        this.#isChainReady = false

        const cleanup = () => {
          // If there are any callbacks left, we have to reject/error them.
          // Otherwise, that would cause a memory leak.
          const disconnectionError = new Error("Disconnected")

          this.#requests.forEach((cb) => cb(disconnectionError))
          this.#subscriptions.forEach(([cb]) => cb(disconnectionError))
          this.#subscriptions.clear()
        }

        const staleSubscriptions: {
          unsubscribeMethod: string
          id: number | string
        }[] = []

        const killStaleSubscriptions = () => {
          if (staleSubscriptions.length === 0) {
            return
          }

          const stale = staleSubscriptions.pop()

          if (!stale) {
            throw new Error("Unable to get stale subscription")
          }

          const { id, unsubscribeMethod } = stale

          Promise.race([
            this.send(unsubscribeMethod, [id]).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 500)),
          ])
            .then(killStaleSubscriptions)
            .catch(() => undefined)
        }

        hc.start((health) => {
          const isReady = !health.isSyncing && (health.peers > 0 || !health.shouldHavePeers)

          // if it's the same as before, then nothing has changed and we are done
          if (this.#isChainReady === isReady) {
            return
          }

          this.#isChainReady = isReady

          if (!isReady) {
            // If we've reached this point, that means that the chain used to be "ready"
            // and now we are about to emit `disconnected`.
            //
            // This will cause the PolkadotJs API think that the connection is
            // actually dead. In reality the smoldot chain is not dead, of course.
            // However, we have to cleanup all the existing callbacks because when
            // the smoldot chain stops syncing, then we will emit `connected` and
            // the PolkadotJs API will try to re-create the previous
            // subscriptions and requests. Although, now is not a good moment
            // to be sending unsubscription messages to the smoldot chain, we
            // should wait until is no longer syncing to send the unsubscription
            // messages from the stale subscriptions of the previous connection.
            //
            // That's why -before we perform the cleanup of `this.#subscriptions`-
            // we keep the necessary information that we will need later on to
            // kill the stale subscriptions.
            ;[...this.#subscriptions.values()].forEach((s) => {
              staleSubscriptions.push(s[1])
            })
            cleanup()
          } else {
            killStaleSubscriptions()
          }

          this.#eventemitter.emit(isReady ? "connected" : "disconnected")
        })

        return {
          ...chain,
          remove: () => {
            hc.stop()
            chain.remove()
            cleanup()
          },
          sendJsonRpc: hc.sendJsonRpc.bind(hc),
        }
      })

    try {
      await this.#chain
    } catch (e) {
      this.#chain = null
      this.#eventemitter.emit("error", e)
      throw e
    }
  }

  async disconnect(): Promise<void> {
    if (!this.#chain) {
      return
    }

    const chain = await this.#chain

    this.#chain = null
    this.#isChainReady = false

    try {
      chain.remove()
    } catch (_) {}

    this.#eventemitter.emit("disconnected")
  }

  on(type: ProviderInterfaceEmitted, sub: ProviderInterfaceEmitCb): () => void {
    // It's possible. Although, quite unlikely, that by the time that polkadot
    // subscribes to the `connected` event, the Provider is already connected.
    // In that case, we must emit to let the consumer know that we are connected.
    if (type === "connected" && this.isConnected) {
      sub()
    }

    this.#eventemitter.on(type, sub)

    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  async send<T = any>(method: string, params: unknown[]): Promise<T> {
    if (!this.isConnected || !this.#chain) {
      throw new Error("Provider is not connected")
    }

    const chain = await this.#chain
    const [id, json] = this.#coder.encodeJson(method, params)

    const result = new Promise<T>((resolve, reject): void => {
      this.#requests.set(id, (response) => {
        ;(isError(response) ? reject : resolve)(response as unknown as T)
      })

      try {
        chain.sendJsonRpc(json)
      } catch (e) {
        this.#chain = null

        try {
          chain.remove()
        } catch (_) {}

        this.#eventemitter.emit("error", e)
      }
    })

    try {
      return await result
    } finally {
      // let's ensure that once the Promise is resolved/rejected, then we remove
      // remove its entry from the internal #requests
      this.#requests.delete(id)
    }
  }

  async subscribe(
    type: string,
    method: string,
    params: any[],
    callback: ProviderInterfaceCallback
  ): Promise<number | string> {
    if (!subscriptionUnsubscriptionMethods.has(method)) {
      throw new Error(`Unsupported subscribe method: ${method}`)
    }

    const id = await this.send<number | string>(method, params)
    const subscriptionId = `${type}::${id}`

    const cb = (response: Error | string) => {
      if (response instanceof Error) {
        callback(response, undefined)
      } else {
        callback(null, response)
      }
    }

    const unsubscribeMethod = subscriptionUnsubscriptionMethods.get(method)

    if (!unsubscribeMethod) {
      throw new Error("Invalid unsubscribe method found")
    }

    this.#subscriptions.set(subscriptionId, [cb, { id, unsubscribeMethod }])

    return id
  }

  unsubscribe(type: string, method: string, id: number | string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error("Provider is not connected")
    }

    const subscriptionId = `${type}::${id}`

    if (!this.#subscriptions.has(subscriptionId)) {
      return Promise.reject(new Error(`Unable to find active subscription=${subscriptionId}`))
    }

    this.#subscriptions.delete(subscriptionId)

    return this.send(method, [id])
  }
}