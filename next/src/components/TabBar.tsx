import { BuhatIcon, KainIcon, PlusIcon } from './Icons'

export type Tab = 'kain' | 'buhat'

type Props = {
  tab: Tab
  onTab: (tab: Tab) => void
  onPlus: () => void
}

// Kain, +, Buhat (Figma component 3:29). Quarters stays in the old app.
export function TabBar({ tab, onTab, onPlus }: Props) {
  return (
    <nav className="tabbar glass" aria-label="Main">
      <button className="tab" aria-current={tab === 'kain' ? 'page' : undefined} onClick={() => onTab('kain')}>
        <KainIcon />
        Kain
      </button>
      <button className="plus" aria-label="Log a meal" onClick={onPlus}>
        <PlusIcon />
      </button>
      <button className="tab" aria-current={tab === 'buhat' ? 'page' : undefined} onClick={() => onTab('buhat')}>
        <BuhatIcon />
        Buhat
      </button>
    </nav>
  )
}
