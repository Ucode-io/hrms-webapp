// import { ProfileBanner } from '../components/ProfileBanner'
// import { QuickActions } from '../components/QuickActions'
import { CheckInActions, CheckInSummary } from '../components/CheckInActions'
import { UpcomingEvents } from '../components/UpcomingEvents'
import { NewsFeed } from '../components/NewsFeed'

export function HomePage() {
  return (
    <>
      {/* <ProfileBanner /> */}
      {/* <QuickActions /> */}
      <CheckInSummary />
      <UpcomingEvents />
      <NewsFeed />
      <CheckInActions />
    </>
  )
}
