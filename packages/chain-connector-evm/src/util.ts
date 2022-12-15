import { ethers } from "ethers"

import { API_KEY_ONFINALITY, RPC_HEALTHCHECK_TIMEOUT } from "./constants"
import log from "./log"

export const throwAfter = (ms: number, reason: any = "timeout") =>
  new Promise((_, reject) => setTimeout(() => reject(reason), ms))

export const resolveRpcUrl = (rpcUrl: string) => {
  // inject api key here because we don't want them in the store (user can modify urls of rpcs)
  return rpcUrl
    .replace(
      /^https:\/\/([A-z-]+)\.api\.onfinality\.io\/public-ws\/?$/,
      `https://$1.api.onfinality.io/ws?apikey=${API_KEY_ONFINALITY}`
    )
    .replace(
      /^https:\/\/([A-z-]+)\.api\.onfinality\.io\/rpc\/?$/,
      `https://$1.api.onfinality.io/rpc?apikey=${API_KEY_ONFINALITY}`
    )
}

export const isHealthyRpc = async (url: string, chainId: number) => {
  try {
    // StaticJsonRpcProvider is better suited for this as it will not do health check requests on it's own
    const provider = new ethers.providers.StaticJsonRpcProvider(url, {
      chainId,
      name: `EVM Network ${chainId}`,
    })

    // check that RPC responds in time
    const rpcChainId = await Promise.race([
      provider.send("eth_chainId", []),
      throwAfter(RPC_HEALTHCHECK_TIMEOUT),
    ])

    // with expected chain id
    return parseInt(rpcChainId, 16) === chainId
  } catch (err) {
    log.error("Unhealthy EVM RPC %s", url, { err })
    return false
  }
}

export const getHealthyRpc = async (rpcUrls: string[], network: ethers.providers.Network) => {
  for (const rpcUrl of rpcUrls) if (await isHealthyRpc(rpcUrl, network.chainId)) return rpcUrl

  // TODO update order and persist to database, code ready below
  // // const unhealthyRpcs: string[] = []

  // // try {
  // //   for (const rpcUrl of rpcUrls) {
  // //     if (await isHealthyRpc(rpcUrl, network.chainId)) {
  // //       return rpcUrl
  // //     } else {
  // //       unhealthyRpcs.push(rpcUrl)
  // //     }
  // //   }
  // // } finally {
  // //   // TODO persist to db ? only for non-custom networks ? (user should have control over this)
  // //   // push unhealthy rpcs to the back of the array
  // //   if (unhealthyRpcs.length > 0 && unhealthyRpcs.length !== rpcUrls.length) {
  // //     rpcUrls.splice(0, unhealthyRpcs.length)
  // //     rpcUrls.push(...unhealthyRpcs)
  // //   }
  // // }

  return null
}

export const isUnhealthyRpcError = (err: any) => {
  // expected errors that are not related to RPC health
  // ex : throw revert on a transaction call that fails
  if (["processing response error"].includes(err.reason)) return false

  // if unknown, assume RPC is unhealthy
  return true
}

export class StandardRpcProvider extends ethers.providers.JsonRpcProvider {
  async send(method: string, params: Array<any>): Promise<any> {
    try {
      return await super.send(method, params)
    } catch (err) {
      // emit error so rpc manager considers this rpc unhealthy
      if (isUnhealthyRpcError(err)) this.emit("error", err)
      throw err
    }
  }
}

export class BatchRpcProvider extends ethers.providers.JsonRpcBatchProvider {
  async send(method: string, params: Array<any>): Promise<any> {
    try {
      return await super.send(method, params)
    } catch (err) {
      // emit error so rpc manager considers this rpc unhealthy
      if (isUnhealthyRpcError(err)) this.emit("error", err)
      throw err
    }
  }
}