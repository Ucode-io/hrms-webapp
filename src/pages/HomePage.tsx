// import { ProfileBanner } from '../components/ProfileBanner'
// import { QuickActions } from '../components/QuickActions'
import { CheckInActions, CheckInSummary } from '../components/CheckInActions'
import { HomeGreeting } from '../components/HomeGreeting'
import { UpcomingEvents } from '../components/UpcomingEvents'
import { MiniApps } from '../components/MiniApps'

export function HomePage() {
  return (
    // Свой шаг вместо общего `gap-4` из AppShell: на главной над сеткой
    // приложений стоят четыре блока подряд, и лишние 4 px между каждым
    // стоят целого ряда мини-приложений на маленьком экране.
    <div className="flex flex-col gap-2.5">
      {/* <ProfileBanner /> */}
      {/* <QuickActions /> */}
      <HomeGreeting />
      <CheckInSummary />
      <CheckInActions />
      <UpcomingEvents />
      <MiniApps />
    </div>
  )
}
