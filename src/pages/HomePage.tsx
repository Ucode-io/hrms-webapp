import { ProfileBanner } from '../components/ProfileBanner'
import { QuickActions } from '../components/QuickActions'
import { NewsFeed } from '../components/NewsFeed'

export function HomePage() {
  return (
    <>
      <ProfileBanner />
      <QuickActions />
      <NewsFeed />
    </>
  )
}
