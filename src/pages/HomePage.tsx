// import { ProfileBanner } from '../components/ProfileBanner'
// import { QuickActions } from '../components/QuickActions'
import { CheckInActions, CheckInSummary } from '../components/CheckInActions'
import { HomeGreeting } from '../components/HomeGreeting'
import { UpcomingEvents } from '../components/UpcomingEvents'
import { MiniApps } from '../components/MiniApps'

export function HomePage() {
  return (
    <>
      {/* <ProfileBanner /> */}
      {/* <QuickActions /> */}
      <HomeGreeting />
      <CheckInSummary />
      <CheckInActions />
      <UpcomingEvents />
      <MiniApps />
    </>
  )
}
