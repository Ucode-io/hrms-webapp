import { ProfileBanner } from '../components/ProfileBanner'
import { QuickActions } from '../components/QuickActions'
import { UpcomingEvents } from '../components/UpcomingEvents'
import { NewsFeed } from '../components/NewsFeed'

export function HomePage() {
  return (
    <>
      <ProfileBanner />
      <QuickActions />
      <UpcomingEvents />
      <NewsFeed />
    </>
  )
}
