import { BackButton } from "@talisman/components/BackButton"
import { scrollbarsStyle } from "@talisman/theme/styles"
import { AnalyticsPage } from "@ui/api/analytics"
import { AccountRemoveModal } from "@ui/domains/Account/AccountRemoveModal"
import { AccountRenameModal } from "@ui/domains/Account/AccountRenameModal"
import { AddressFormatterModal } from "@ui/domains/Account/AddressFormatterModal"
import { BuyTokensModal } from "@ui/domains/Asset/Buy/BuyTokensModal"
import { ReceiveTokensModal } from "@ui/domains/Asset/Receive/ReceiveTokensModal"
import { SendTokensModal } from "@ui/domains/Asset/Send/SendTokensModal"
import { FC, Suspense, lazy } from "react"
import styled from "styled-components"

import { OnboardingToast } from "./OnboardingToast"
import { SideBar } from "./SideBar"

const DashboardNotifications = lazy(() => import("./DashboardNotifications"))

type LayoutProps = {
  children?: React.ReactNode
  centered?: boolean
  large?: boolean
  withBack?: boolean
  backTo?: string
  className?: string
  analytics?: AnalyticsPage
}

const UnstyledLayout: FC<LayoutProps> = ({ withBack, backTo, children, className, analytics }) => {
  return (
    <main className={className}>
      <SideBar />
      <section className="main-area">
        <div className="children">
          {!!withBack && <BackButton analytics={analytics} className="back" to={backTo} />}
          {children}
        </div>
        <Suspense fallback={null}>
          <DashboardNotifications />
        </Suspense>
      </section>
      <SendTokensModal />
      <BuyTokensModal />
      <ReceiveTokensModal />
      <AccountRenameModal />
      <AccountRemoveModal />
      <AddressFormatterModal />
      <OnboardingToast />
    </main>
  )
}

const Layout = styled(UnstyledLayout)`
  width: 100%;
  height: 100vh;
  color: var(--color-forground);
  display: flex;

  .main-area {
    flex-grow: 1;
    overflow: hidden;
    overflow-y: scroll;
    padding: 5.2rem;

    ${scrollbarsStyle()}

    > .children {
      display: block;
      width: 100%;
      position: relative;

      > .back {
        margin-bottom: 3rem;
      }
    }

    ${({ centered, large }) =>
      !!centered &&
      `
      display: flex;
      align-items: flex-start;
      justify-content: center;

      > .children{
        max-width: ${large ? "120rem" : "66rem"};
      }
    `}
  }
`

export default Layout