import { BookOpen, CalendarCheck, Lock, PackageCheck, ShoppingBasket, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import type { ActiveTab } from '../types';

interface NavShellProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  selectedMealsCount: number;
  activeGroceryCount: number;
  autoStaplesCount: number;
  mappedGroceryCount: number;
  passcodeEnabled?: boolean;
  onLock?: () => void;
  children: React.ReactNode;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: typeof BookOpen;
  badge?: number;
}

export function NavShell({
  activeTab,
  onSelectTab,
  selectedMealsCount,
  activeGroceryCount,
  autoStaplesCount,
  mappedGroceryCount,
  passcodeEnabled = false,
  onLock,
  children,
}: NavShellProps) {
  const navItems: NavItem[] = [
    { id: 'meals', label: 'Meals', shortLabel: 'Meals', icon: BookOpen },
    {
      id: 'staples',
      label: 'Staples',
      shortLabel: 'Staples',
      icon: PackageCheck,
      badge: autoStaplesCount > 0 ? autoStaplesCount : undefined,
    },
    {
      id: 'plan',
      label: 'Meal Plan',
      shortLabel: 'Plan',
      icon: CalendarCheck,
      badge: selectedMealsCount > 0 ? selectedMealsCount : undefined,
    },
    {
      id: 'list',
      label: 'Grocery List',
      shortLabel: 'List',
      icon: ShoppingBasket,
      badge: activeGroceryCount > 0 ? activeGroceryCount : undefined,
    },
    {
      id: 'kroger',
      label: 'Kroger',
      shortLabel: 'Kroger',
      icon: ShoppingCart,
      badge: mappedGroceryCount > 0 ? mappedGroceryCount : undefined,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F6F1] text-[#1A241E]">
      {/* Top header */}
      <header className="sticky top-0 z-30 bg-[#F8F6F1]/95 backdrop-blur-md border-b border-[#E6E1D6]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            id="brand-home-btn"
            onClick={() => onSelectTab('meals')}
            className="flex items-center gap-2.5 text-left focus:outline-none group"
          >
            <span className="w-9 h-9 rounded-xl bg-[#1B5E42] text-white flex items-center justify-center shadow-xs group-hover:bg-[#144A33] transition-colors">
              <UtensilsCrossed className="w-4.5 h-4.5" />
            </span>
            <span className="flex flex-col">
              <span className="font-display text-lg font-bold tracking-tight text-[#1A241E] leading-tight">
                PantryPilot
              </span>
              <span className="text-[11px] font-medium text-[#5C6961] leading-none hidden sm:inline">
                Family Meal Planner &amp; Cart Assistant
              </span>
            </span>
          </button>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-2">
            <nav aria-label="Primary navigation" className="flex items-center gap-1 bg-white/80 p-1 rounded-2xl border border-[#E6E1D6]">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`desktop-nav-${item.id}`}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#1B5E42] text-white shadow-xs'
                        : 'text-[#5C6961] hover:text-[#1A241E] hover:bg-[#F3EFE6]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-[#EBF4EF] text-[#1B5E42]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            {passcodeEnabled && onLock && (
              <button
                type="button"
                onClick={onLock}
                title="Lock PantryPilot"
                aria-label="Lock PantryPilot"
                className="w-10 h-10 rounded-xl bg-white/80 border border-[#E6E1D6] flex items-center justify-center text-[#5C6961] hover:text-[#1A241E] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mobile quick status pill */}
          <div className="md:hidden flex items-center gap-2">
            {selectedMealsCount > 0 && activeTab !== 'plan' && (
              <button
                type="button"
                onClick={() => onSelectTab('plan')}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-[#EBF4EF] text-[#1B5E42] border border-[#C4DDD0] tabular-nums"
              >
                {selectedMealsCount} planned
              </button>
            )}
            {passcodeEnabled && onLock && (
              <button
                type="button"
                onClick={onLock}
                title="Lock PantryPilot"
                aria-label="Lock PantryPilot"
                className="w-9 h-9 rounded-xl bg-white border border-[#E6E1D6] flex items-center justify-center text-[#5C6961]"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 pb-28 md:pb-12">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E6E1D6] px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(26,36,30,0.06)]"
      >
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`mobile-nav-${item.id}`}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative flex flex-col items-center justify-center min-h-[52px] rounded-xl transition-colors ${
                  isActive
                    ? 'text-[#1B5E42] bg-[#EBF4EF]'
                    : 'text-[#5C6961] active:bg-[#F3EFE6]'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.9]'}`} />
                  {item.badge !== undefined && (
                    <span
                      className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums ${
                        isActive
                          ? 'bg-[#1B5E42] text-white'
                          : 'bg-[#B85D2B] text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10.5px] mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
