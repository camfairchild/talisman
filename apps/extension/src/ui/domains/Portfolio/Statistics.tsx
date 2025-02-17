import { Token } from "@extension/core"
import { LockIcon } from "@talismn/icons"
import { classNames } from "@talismn/util"
import { useSelectedCurrency, useToggleCurrency } from "@ui/hooks/useCurrency"
import BigNumber from "bignumber.js"
import { ReactNode } from "react"

import currencyConfig from "../Asset/currencyConfig"
import { Fiat } from "../Asset/Fiat"
import Tokens from "../Asset/Tokens"

type StatisticsProps = {
  title: ReactNode
  tokens?: BigNumber
  fiat: number | null
  className?: string
  token?: Token
  locked?: boolean
  showTokens?: boolean
  showCurrencyToggle?: boolean
}

const TokensAndFiat = ({
  tokenAmount,
  fiat,
  token,
  currencyDisplay,
}: {
  tokenAmount?: BigNumber
  fiat: number | null
  token?: Token
  currencyDisplay?: string
}) => (
  <div className="flex flex-col gap-2 whitespace-nowrap">
    <div className="textbase text-white">
      <Tokens
        amount={tokenAmount ?? "0"}
        isBalance
        decimals={token?.decimals}
        symbol={token?.symbol}
      />
    </div>
    <div className="text-body-secondary text-sm">
      {fiat === null ? "-" : <Fiat amount={fiat} isBalance currencyDisplay={currencyDisplay} />}
    </div>
  </div>
)

const FiatOnly = ({ fiat, currencyDisplay }: { fiat: number | null; currencyDisplay?: string }) => (
  <div className="textbase text-white">
    {fiat === null ? "-" : <Fiat amount={fiat} isBalance currencyDisplay={currencyDisplay} />}
  </div>
)

export const Statistics = ({
  title,
  tokens,
  fiat,
  className,
  token,
  locked,
  showTokens,
  showCurrencyToggle,
}: StatisticsProps) => {
  const currency = useSelectedCurrency()
  const toggleCurrency = useToggleCurrency()

  return (
    <div
      className={classNames(
        "bg-black-secondary flex h-[10rem] w-[23.6rem] flex-col gap-4 rounded p-8 ",
        className
      )}
    >
      <div className="text-body-secondary flex items-center gap-2 text-sm">
        {locked && <LockIcon />}
        {title}
      </div>
      <div className="flex items-center gap-2">
        {showCurrencyToggle && (
          <button
            className="border-grey-750 bg-grey-800 text-body-secondary hover:bg-grey-700 pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border text-center transition-colors duration-100 ease-out"
            onClick={(event) => {
              event.stopPropagation()
              toggleCurrency()
            }}
          >
            {currencyConfig[currency]?.unicodeCharacter}
          </button>
        )}
        {showTokens ? (
          <TokensAndFiat
            tokenAmount={tokens}
            fiat={fiat}
            token={token}
            currencyDisplay={showCurrencyToggle ? "code" : undefined}
          />
        ) : (
          <FiatOnly fiat={fiat} currencyDisplay={showCurrencyToggle ? "code" : undefined} />
        )}
      </div>
    </div>
  )
}
