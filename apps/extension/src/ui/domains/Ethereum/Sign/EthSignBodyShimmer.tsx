import { FadeIn } from "@talisman/components/FadeIn"
import { LoaderIcon } from "@talisman/theme/icons"

export const EthSignBodyShimmer = () => {
  return (
    <FadeIn className="flex flex-col items-center gap-2 pt-64 leading-[140%]">
      <LoaderIcon className="animate-spin-slow h-16 w-16" />
      <div className="mt-4 text-base font-bold text-white opacity-70">Analysing transaction</div>
      <div className="text-sm font-normal  opacity-70">This shouldn't take long...</div>
    </FadeIn>
  )
}